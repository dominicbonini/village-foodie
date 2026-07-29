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

const SLOT_INTERVAL_MINS = 5

export interface SeededOrders {
  inserted: number
  mainsItems: number
  /** Total item lines across all orders — mains + accompaniments. */
  totalItems: number
  slotsUsed: string[]
  skippedNoMenu: boolean
  /** Highest mains-per-slot actually placed. MUST be <= capacity — surfaced so a breach is provable. */
  peakPerSlot: number
}

/** One REQUIRED group and every option this dish may legitimately be given for it. */
interface RequiredGroup { choices: { name: string; price: number }[] }

interface MenuLine {
  id: string
  name: string
  price: number
  category: string
  cooked: boolean
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

export async function seedDemoOrders(
  supabase: SupabaseClient,
  args: {
    truckId: string
    eventId: string
    eventDate: string
    startTime: string
    endTime: string
    /** The MAINS BATCH — the per-slot ceiling the seeder must never breach (fix 4/6). */
    capacity: number
    count?: number
    /** Wall-clock "now" for the FLOOR below. Passed in (not read via new Date()) so the seeder stays
     *  deterministic and unit-testable. Omit → no clock floor (first collection is just start+10, the
     *  pre-floor behaviour) — used by callers/tests that don't care about elapsed time. */
    now?: Date
    tz?: string
  },
): Promise<SeededOrders> {
  const ceiling = Math.max(1, args.capacity)

  const { data: itemRows } = await supabase
    .from('menu_items_db')
    .select('id, name, price, menu_categories!category_id(name, prep_secs)')
    .eq('truck_id', args.truckId).eq('is_active', true).limit(120)

  const requiredMods = await resolveRequiredMods(
    supabase, args.truckId, (itemRows ?? []).map(r => (r as Record<string, any>).id as string))

  const all: MenuLine[] = (itemRows ?? []).map(r => {
    const row = r as Record<string, any>
    const cat = row.menu_categories
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      price: Number(row.price ?? 0),
      category: String(cat?.name ?? ''),
      cooked: Number(cat?.prep_secs ?? 0) > 0,
      requiredMods: requiredMods.get(String(row.id)) ?? [],
    }
  }).filter(l => l.name)

  const mains = all.filter(l => l.cooked)
  const others = all.filter(l => !l.cooked)
  if (all.length === 0) return { inserted: 0, mainsItems: 0, totalItems: 0, slotsUsed: [], skippedNoMenu: true, peakPerSlot: 0 }
  // No cooked category (inference fell back, or a drinks-only menu) — seed from everything rather than
  // seeding nothing. The board still populates; it just has no capacity story to tell.
  const mainsPool = mains.length ? mains : all
  const otherPool = others.length ? others : all

  // ── Slot plan (fixes 2/3/4) ────────────────────────────────────────────────────────────────────────
  // FIRST COLLECTION = max(start+10, now+10), rounded UP to the 5-min grid.
  // WHY not just start+10: demoEventWindow floors the start to the nearest half hour, so the start can be
  // up to 29 min in the PAST. The front-weighted FILL_PATTERN puts the fullest budgets in the earliest
  // slots, so without this clamp a prospect's first impression would be a block of orders already late.
  // Clamping the floor to now+10 pushes the busy front into the near-future. Ceil-to-5 keeps it on grid.
  const startPlusMins = toMinsLocal(args.startTime) + FIRST_COLLECTION_OFFSET_MINS
  const nowMins = args.now ? venueNowMins(args.now, args.tz ?? 'Europe/London') : null
  const floorMins = nowMins != null ? Math.max(startPlusMins, nowMins + FIRST_COLLECTION_OFFSET_MINS) : startPlusMins
  const firstMins = Math.ceil(floorMins / SLOT_INTERVAL_MINS) * SLOT_INTERVAL_MINS
  const firstCollection = minsToHHMMLocal(firstMins)
  const slots = generateSlots(firstCollection, args.endTime, SLOT_INTERVAL_MINS)
  if (!slots.length) return { inserted: 0, mainsItems: 0, totalItems: 0, slotsUsed: [], skippedNoMenu: false, peakPerSlot: 0 }

  // ── TARGET, DERIVED FROM THE WINDOW (see ORDERS_PER_SLOT) ─────────────────────────────────────────
  // Computed HERE, after `slots`, not at the top of the function — the whole point is that it depends on
  // how much window there actually is. An explicit `args.count` still wins (callers/tests that want a
  // fixed board), and the result is clamped so it can never exceed the full-window figure.
  const target = args.count ?? Math.max(
    MIN_TARGET_ORDERS,
    Math.min(TARGET_ORDERS, Math.round(slots.length * ORDERS_PER_SLOT)),
  )

  // ── ORDER SHAPES → the mains bill ─────────────────────────────────────────────────────────────────
  const shapes = Array.from({ length: target }, (_, i) => ORDER_SHAPES[i % ORDER_SHAPES.length])
  const totalMainsNeeded = shapes.reduce((s, sh) => s + sh.mains, 0)

  // ── SLOT BUDGETS, strided across the whole window ─────────────────────────────────────────────────
  // Budgets, not fixed counts: orders now carry 1 or 2 mains, so the planner has to PACK them into a
  // per-slot allowance rather than emit one order per main. Walking the pattern slot-by-slot would exhaust
  // the budget early on a long window (3h = 35 slots) and leave the back third dead, so the budgets are
  // built first and then STRIDED evenly. Deterministic throughout — no Math.random, so an odd-looking
  // board can be re-inspected.
  const budgets: number[] = []
  let mainsLeft = totalMainsNeeded
  const nonZero = FILL_PATTERN.filter(f => f > 0)
  for (let i = 0; mainsLeft > 0 && i < slots.length; i++) {
    // 🔴 THE BREACH GUARD: a slot's budget NEVER exceeds the batch. Orders are packed within it below, so
    // no combination of order sizes can push a slot over the ceiling.
    const n = Math.min(Math.max(1, Math.round(ceiling * nonZero[i % nonZero.length])), ceiling, mainsLeft)
    budgets.push(n)
    mainsLeft -= n
  }

  const planned: { slot: string; budget: number }[] = []
  const stride = budgets.length > 0 ? slots.length / budgets.length : 1
  const taken = new Set<number>()
  budgets.forEach((n, j) => {
    let idx = Math.min(slots.length - 1, Math.round(j * stride))
    while (taken.has(idx) && idx < slots.length - 1) idx++      // never double-book one slot
    if (taken.has(idx)) return
    taken.add(idx)
    planned.push({ slot: slots[idx], budget: n })
  })
  planned.sort((a, b) => a.slot.localeCompare(b.slot))

  // ── Build the orders ───────────────────────────────────────────────────────────────────────────────
  const rows: Record<string, unknown>[] = []
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

  // ── PACK orders into slot budgets ─────────────────────────────────────────────────────────────────
  // An order goes into the first slot (in time order) whose REMAINING budget covers its mains. A 2-main
  // order therefore skips a slot with only 1 left rather than overflowing it — the guarantee that no
  // combination of order sizes can breach. A zero-main order (drinks only) can go anywhere a slot is in
  // use, since it occupies no capacity.
  const remaining = planned.map(p => ({ slot: p.slot, left: p.budget, used: 0 }))
  let mainsItems = 0
  let totalItems = 0
  let peakPerSlot = 0
  const usedSlots: string[] = []

  for (const shape of shapes) {
    const target = shape.mains > 0
      ? remaining.find(r => r.left >= shape.mains)
      // Drinks-only: attach to the busiest slot still in play so it sits among real tickets.
      : remaining.find(r => r.used > 0) ?? remaining[0]
    if (!target) continue      // no slot can take it — drop the order rather than breach

    const lines: ReturnType<typeof lineFor>[] = []
    for (let m = 0; m < shape.mains; m++) { lines.push(lineFor(mainsPool[pick % mainsPool.length], 1, pick)); pick++ }
    for (let e = 0; e < shape.extras; e++) { lines.push(lineFor(otherPool[pick % otherPool.length], 1, pick)); pick++ }
    if (!lines.length) continue

    makeOrder(target.slot, lines)
    target.left -= shape.mains
    target.used += shape.mains
    mainsItems += shape.mains
    totalItems += lines.length
    peakPerSlot = Math.max(peakPerSlot, target.used)
    if (!usedSlots.includes(target.slot)) usedSlots.push(target.slot)
  }

  if (!rows.length) return { inserted: 0, mainsItems: 0, totalItems: 0, slotsUsed: [], skippedNoMenu: false, peakPerSlot: 0 }

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
  rows.forEach((r, i) => { r.id = String(i + 1) })

  const { error } = await supabase.from('orders').insert(rows)
  if (error) throw new Error(`Seeding demo orders failed: ${error.message}`)

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
    // peakPerSlot is returned so a breach is PROVABLE rather than assumed — it must never exceed
    // `capacity` (the mains batch). The admin provision panel surfaces it.
    slotsUsed: usedSlots,
    skippedNoMenu: false,
    peakPerSlot,
  }
}
