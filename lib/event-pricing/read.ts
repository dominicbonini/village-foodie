// lib/event-pricing/read.ts — reading an event's pricing, and the event-aware price book.
//
// ── 🔴 EVERY READ HERE IS CAPABILITY-PROBED, FOR THE REASON lib/event-types/read.ts EXISTS ─────────
// The columns and the table this reads are added by 20261011_event_pricing.sql. Postgres answers
// 42703 (undefined column) / 42P01 (undefined table) and PostgREST answers PGRST204/PGRST205 for
// something it cannot see, and a NAMED select that hits one FAILS THE WHOLE STATEMENT. These reads
// are therefore SEPARATE from every select the surfaces already run, and every failure resolves to
// **menu prices** — which is today's behaviour for every truck.
//
// 🔴 SO THE FAIL-OPEN STATE IS SAFE HERE IN A WAY IT USUALLY IS NOT, AND IT IS WORTH SAYING WHY.
// Failing open normally means "the guard did not run". Here it means "charge the menu price", which
// is exactly what this product charged before this build and what it charges for every truck that
// never uses the feature. A code-before-migration deploy is a NO-OP on the money path, not an
// outage and not a mispricing. (It is still not permission to deploy before the migration: the
// screens would report that prices are not switched on.)
//
// ⚠️ THE PRICING COLUMNS ARE **NOT** ADDED TO lib/event-types/read.ts's `TYPE_COLS`, DELIBERATELY.
// That select carries the five SERVICE settings, and one missing pricing column there would fail it
// and take collection times, the mark-ready step and offline protection down with it — a pricing
// migration breaking service settings. Two reads; one blast radius each.

import type { SupabaseClient } from '@supabase/supabase-js'
import { lineIdentity, loadPriceBook, type PriceBook } from '@/lib/order-repricing'
import {
  priceAtEvent, pricingApplies, pricingDiffersFromMenu, resolveEventPricing, toPence, toPounds,
  MENU_PRICES,
  type EventItemPricing, type EventPricingColumns, type PriceBasis, type TypePricing,
} from './price'

/** The codes that mean "the migration has not been applied". Anything else is a real failure. */
const NOT_THERE = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

const why = (code: string | undefined): string =>
  code && NOT_THERE.has(code)
    ? `the pricing columns/table are absent (${code}) — migration 20261011 has not been applied`
    : `read failed (${code ?? 'no code'})`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · ONE EVENT'S PRICING
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface EventPricingRead {
  /** false when a read failed. The answer is still safe to use — it is "menu prices". */
  ok: boolean
  /** What applies here, PER ITEM: the event's own typed prices, then the type's setup. */
  resolved: EventItemPricing
  /** The event's type id and name, for the summaries. Null when the event has no type. */
  typeId: string | null
  typeName: string | null
  /**
   * The event's four price columns, raw.
   * ⛔ FOR REPORTING ONLY — nothing prices against them any more. See `EventPricingColumns`.
   */
  eventColumns: EventPricingColumns | null
  type: TypePricing | null
  /** Both typed sets. POUNDS by `menu_items_db.id`. */
  eventTyped: Readonly<Record<string, number>>
  typeTyped: Readonly<Record<string, number>>
}

export const NO_EVENT_PRICING: EventPricingRead = {
  ok: true, resolved: MENU_PRICES, typeId: null, typeName: null,
  eventColumns: null, type: null, eventTyped: {}, typeTyped: {},
}

/** `event_item_prices` rows for one owner, as POUNDS by item id. A failure reads as "none". */
async function readTypedPrices(
  supabase: SupabaseClient,
  column: 'event_id' | 'event_type_id',
  ownerId: string | null,
): Promise<{ ok: boolean; typed: Record<string, number> }> {
  const typed: Record<string, number> = {}
  if (!ownerId) return { ok: true, typed }
  try {
    const { data, error } = await supabase
      .from('event_item_prices')
      .select('item_id, price')
      .eq(column, ownerId)
    if (error) {
      console.warn(`[event-pricing] typed prices for ${column}=${ownerId}: ${why((error as { code?: string }).code)}; none`)
      return { ok: false, typed }
    }
    for (const r of (data as { item_id: string; price: unknown }[] | null) ?? []) {
      /* ⚠️ `price` IS numeric AND ARRIVES AS A STRING through PostgREST. `toPounds(toPence(…))` is the
       * round trip that makes it a number with no sub-penny tail — and it is the SAME pair every
       * other price in this feature crosses the boundary with. */
      typed[r.item_id] = toPounds(toPence(r.price))
    }
    return { ok: true, typed }
  } catch (e) {
    console.warn('[event-pricing] typed prices read threw; none:', e instanceof Error ? e.message : String(e))
    return { ok: false, typed }
  }
}

/**
 * ── 🔴 ONE EVENT'S EFFECTIVE PRICING SETUP ────────────────────────────────────────────────────────
 * Two probed reads, then (only if something is actually on) the typed rows.
 *
 * ⚠️ THE EVENT AND ITS TYPE ARE ONE SELECT, through the embed `event_types!event_type_id (…)` — the
 * same shape `readEventType` uses, and for the same reason: a dashboard poll must not gain a second
 * round trip. If the embed cannot resolve, the whole read fails open to menu prices.
 * ⚠️ THE TYPED ROWS ARE FETCHED ONLY FOR THE SET THAT WINS, except when `forEditing` asks for both —
 * the dashboard sheet draws the type's column beside the event's, so it needs the loser too. The
 * money path never pays for that.
 */
export async function readEventPricing(
  supabase: SupabaseClient,
  eventId: string | null | undefined,
  opts?: { forEditing?: boolean },
): Promise<EventPricingRead> {
  if (!eventId) return NO_EVENT_PRICING
  /* ⚠️ A NAMED TYPE, NOT `typeof row` AT THE ASSIGNMENT. `let row: T | null = null` narrows `row` to
   * `null`, so `data as typeof row` casts to `null` and every field read below is an error on
   * `never` — a trap worth one line to avoid. */
  type PricingRow = {
    price_own?: boolean | null; price_mode?: string | null
    price_amount?: number | string | null; price_rounding?: string | null
    event_type_id?: string | null
    event_types?: unknown
  }
  let row: PricingRow | null = null
  try {
    const { data, error } = await supabase
      .from('truck_events')
      .select(
        'price_own, price_mode, price_amount, price_rounding, event_type_id, '
        + 'event_types!event_type_id (id, name, price_change_on, price_mode, price_amount, price_rounding)',
      )
      .eq('id', eventId)
      .maybeSingle()
    if (error) {
      console.warn(`[event-pricing] event ${eventId}: ${why((error as { code?: string }).code)}; menu prices`)
      return { ...NO_EVENT_PRICING, ok: false }
    }
    row = data as PricingRow | null
  } catch (e) {
    console.warn(`[event-pricing] event ${eventId}: read threw; menu prices:`, e instanceof Error ? e.message : String(e))
    return { ...NO_EVENT_PRICING, ok: false }
  }
  if (!row) return NO_EVENT_PRICING

  /* ⚠️ AN EMBED ARRIVES AS AN OBJECT **OR** AN ARRAY depending on how PostgREST reads the
   * relationship, and a one-row embed has arrived as both in this codebase — `readEventType` carries
   * the same normalisation for the same reason. */
  const embedded = row.event_types as
    | (TypePricing & { id: string; name: string })
    | (TypePricing & { id: string; name: string })[]
    | null
    | undefined
  const type = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null

  const eventColumns: EventPricingColumns = {
    price_own: row.price_own ?? null,
    price_mode: row.price_mode ?? null,
    price_amount: row.price_amount ?? null,
    price_rounding: row.price_rounding ?? null,
  }

  /* ══ 🔴 THE EVENT'S TYPED ROWS ARE **ALWAYS** READ NOW (5 October 2026) ═══════════════════════════
   * They used to be fetched only when `price_own` was true or the sheet asked for them, because an
   * event's typed prices were meaningless unless its whole-event switch was on. Under the per-item
   * rule each one stands on its own, so skipping the read would mean an event price the operator set
   * silently not being charged — on the money path.
   * ⚠️ IT IS ONE EXTRA SELECT ON A TABLE THAT IS EMPTY FOR EVERY TRUCK TODAY, in parallel with the
   * type's. It degrades to "none" on any failure, exactly as before.
   * ⚠️ THE TYPE'S ROWS ARE STILL ONLY FETCHED WHEN ITS SWITCH IS ON (or the sheet asks), because a
   * type with pricing off contributes nothing at all. */
  const wantType = type?.price_change_on === true || opts?.forEditing === true
  const [ev, ty] = await Promise.all([
    readTypedPrices(supabase, 'event_id', eventId),
    wantType ? readTypedPrices(supabase, 'event_type_id', type?.id ?? null) : Promise.resolve({ ok: true, typed: {} }),
  ])

  return {
    ok: ev.ok && ty.ok,
    resolved: resolveEventPricing(ev.typed, type, ty.typed),
    typeId: type?.id ?? row.event_type_id ?? null,
    typeName: type?.name ?? null,
    eventColumns,
    type,
    eventTyped: ev.typed,
    typeTyped: ty.typed,
  }
}

/** Every type's pricing for one truck, for the grid. A failure reads as "no type prices". */
export async function readTypePricingForTruck(
  supabase: SupabaseClient,
  truckId: string,
): Promise<{
  ok: boolean
  byTypeId: Map<string, TypePricing & { id: string }>
  typedByTypeId: Map<string, Record<string, number>>
}> {
  const byTypeId = new Map<string, TypePricing & { id: string }>()
  const typedByTypeId = new Map<string, Record<string, number>>()
  try {
    const { data, error } = await supabase
      .from('event_types')
      .select('id, price_change_on, price_mode, price_amount, price_rounding')
      .eq('truck_id', truckId)
    if (error) {
      console.warn(`[event-pricing] type prices for truck ${truckId}: ${why((error as { code?: string }).code)}; none`)
      return { ok: false, byTypeId, typedByTypeId }
    }
    for (const t of (data as (TypePricing & { id: string })[] | null) ?? []) byTypeId.set(t.id, t)

    /* ⚠️ ONE READ FOR EVERY TYPE'S TYPED ROWS, truck-scoped. `event_item_prices.truck_id` exists for
     * exactly this: the grid shows every type's column at once, and a read per type would be N round
     * trips on a screen an operator opens to look at five numbers. */
    const { data: rows, error: rowsErr } = await supabase
      .from('event_item_prices')
      .select('event_type_id, item_id, price')
      .eq('truck_id', truckId)
      .not('event_type_id', 'is', null)
    if (rowsErr) {
      console.warn(`[event-pricing] typed prices for truck ${truckId}: ${why((rowsErr as { code?: string }).code)}; none`)
      return { ok: false, byTypeId, typedByTypeId }
    }
    for (const r of (rows as { event_type_id: string; item_id: string; price: unknown }[] | null) ?? []) {
      const bucket = typedByTypeId.get(r.event_type_id) ?? {}
      bucket[r.item_id] = toPounds(toPence(r.price))
      typedByTypeId.set(r.event_type_id, bucket)
    }
    return { ok: true, byTypeId, typedByTypeId }
  } catch (e) {
    console.warn('[event-pricing] type prices read threw; none:', e instanceof Error ? e.message : String(e))
    return { ok: false, byTypeId, typedByTypeId }
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE ITEMS, WITH THEIR IDS
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface PricingItem {
  id: string
  name: string
  /** The MENU price, in integer pence. */
  pricePence: number
  categoryId: string | null
}

/**
 * This truck's items with their ids, for applying typed prices and for the grid.
 *
 * ── 🔴 NO AVAILABILITY FILTER. `truck_id` AND NOTHING ELSE. ───────────────────────────────────────
 * This is the same rule, for the same reason, as `loadPriceBook`'s own header — and it has to be
 * stated at this end too, because a reader tightening THIS function would break ordering just as
 * surely. A SOLD-OUT ITEM MUST STAY PRICEABLE: both order paths price BEFORE the stock guard runs,
 * and an unpriceable line REFUSES the order, so adding `.eq('is_available', true)` here would mean a
 * customer is told "the menu has changed" instead of "only 2 Margherita left" — during service, on a
 * dish the truck deliberately ran down. `menu_items_db` carries `is_active`, `is_available`,
 * `stock_count` and `default_stock`; none of them is read here. Sold out is a STATE on a row that
 * still exists, and only a MISSING row is unpriceable.
 * 🔴 `/api/menu` APPLIES `.eq('is_active', true)` AND THIS MUST NOT: the price book has to stay a
 * STRICT SUPERSET of what the menu offers, so anything orderable is always priceable.
 */
export async function loadPricingItems(
  supabase: SupabaseClient,
  truckId: string,
): Promise<{ ok: boolean; items: PricingItem[] }> {
  try {
    const { data, error } = await supabase
      .from('menu_items_db')
      .select('id, name, price, category_id')
      .eq('truck_id', truckId)
      .order('name')
    if (error) {
      console.warn(`[event-pricing] items for truck ${truckId}: ${why((error as { code?: string }).code)}; none`)
      return { ok: false, items: [] }
    }
    return {
      ok: true,
      items: ((data as { id: string; name: string; price: unknown; category_id: string | null }[] | null) ?? [])
        .map(r => ({ id: r.id, name: r.name, pricePence: toPence(r.price), categoryId: r.category_id ?? null })),
    }
  } catch (e) {
    console.warn('[event-pricing] items read threw; none:', e instanceof Error ? e.message : String(e))
    return { ok: false, items: [] }
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE EVENT-AWARE PRICE BOOK
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface EventPriceBook {
  /**
   * The book to hand to `repriceOrder` — the SAME `PriceBook` shape, with only `itemPrice` moved.
   *
   * ⚠️ `optionPrice`, `bundle` AND `menuItems` ARE THE OBJECTS `loadPriceBook` RETURNED, untouched.
   * Extras and deals keep their menu prices by rule, and `menuItems` is read by
   * `calculateOrderTotal` for ONE purpose — a deal's original price, i.e. the "you saved £x" figure
   * (lib/order-calculations.ts:103). Moving it would make a deal's SAVING follow event pricing while
   * the deal's PRICE did not, which is a figure no operator set and no screen could explain.
   */
  book: PriceBook
  /**
   * The MENU price, in pounds, by item name — **only for the items whose price event pricing moved.**
   *
   * 🔴 ONLY THE MOVED ONES, AND THAT IS WHAT KEEPS AN UNTOUCHED ORDER BYTE-IDENTICAL. The order
   * routes stamp `menu_price` / `price_basis` on a line exactly when its name is in here, so a truck
   * not using this feature gets an empty map, no line is stamped, and the stored jsonb is the same
   * bytes as before this build.
   */
  menuPrice: Readonly<Record<string, number>>
  /**
   * Where each moved item's price came from, by the SAME item NAME as `menuPrice`.
   *
   * ══ 🔴 PER ITEM, NOT ONE VALUE FOR THE BOOK (5 October 2026) ══════════════════════════════════
   * This was `basis: PriceBasis | null` — one answer for the whole order — because the old rule
   * resolved ONE setup per event. Under the per-item rule an event can charge its own price for one
   * dish and the type's rule for another, so a single basis would label one of them wrongly on a
   * stored order line. The two maps have exactly the same keys: an item is in both, or in neither.
   */
  basisByName: Readonly<Record<string, PriceBasis>>
  /** The pricing read, so a caller can report or summarise without reading again. */
  pricing: EventPricingRead
}

/**
 * ══ 🔴 THE EVENT-AWARE PRICE BOOK — **BESIDE** `loadPriceBook`, NEVER INSTEAD OF IT ═══════════════
 *
 * `loadPriceBook(supabase, truckId)` is untouched: same signature, same queries, same bytes. It is
 * still the only thing the price-lock path needs, and `scripts/event-pricing.cjs` asserts it is
 * byte-identical to its named parent. This wraps it.
 *
 * ── 🔴 THE NO-PRICING PATH RETURNS `loadPriceBook`'s OWN OBJECT, NOT A COPY OF IT ─────────────────
 * For a truck with no event types and no event own-prices — every truck today — this function reads
 * the event's pricing (one probed select that resolves to "menu prices"), then returns the price book
 * `loadPriceBook` built, by reference, with an EMPTY `menuPrice`. So "deep-equal to `loadPriceBook`'s
 * output" is not a property that has to be tested into existence; it is the same object. The only
 * cost is the one probed select, and `loadPriceBook`'s four queries still run in parallel with it.
 *
 * @param eventId the event this order/menu is for, already resolved to EXACTLY ONE event by the
 *                caller. 🔴 **NEVER PASS A GUESS.** Decision 7: where the event is ambiguous the
 *                caller must refuse rather than price against one of the candidates — see
 *                `candidatesChangePrices`.
 */
export async function loadEventPriceBook(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string | null | undefined,
): Promise<EventPriceBook> {
  const [book, pricing] = await Promise.all([
    loadPriceBook(supabase, truckId),
    readEventPricing(supabase, eventId),
  ])

  /* 🔴 THE EARLY RETURN IS THE IDENTITY PROOF. Same object, empty maps. */
  if (!pricingApplies(pricing.resolved)) return { book, menuPrice: {}, basisByName: {}, pricing }

  const { items } = await loadPricingItems(supabase, truckId)
  const itemPrice: Record<string, number> = { ...book.itemPrice }
  const menuPrice: Record<string, number> = {}
  const basisByName: Record<string, PriceBasis> = {}
  for (const it of items) {
    /* 🔴 THE SAME FUNCTION THE MENU API AND THE DASHBOARD'S PRICE COLUMN CALL. The price an operator
     * reads, the price a customer is shown and the price an order is charged come from one place. */
    const { pence, basis } = priceAtEvent(it.pricePence, it.id, pricing.resolved)
    if (basis === null) continue
    itemPrice[it.name] = toPounds(pence)
    menuPrice[it.name] = toPounds(it.pricePence)
    basisByName[it.name] = basis
  }

  /* ⚠️ NOTHING MOVED ⇒ THE ORIGINAL BOOK AGAIN. A type whose switch is on with mode 'none' and no
   * typed prices changes no price, so an order under it must store no `price_basis` either — the
   * field means "this line was priced by event pricing", and stamping it on a line that was not
   * would make the audit field a lie. */
  if (Object.keys(menuPrice).length === 0) return { book, menuPrice: {}, basisByName: {}, pricing }

  return {
    book: { ...book, itemPrice },
    menuPrice,
    basisByName,
    pricing,
  }
}

/**
 * ══ 🔴 DECISION 7 — AN AMBIGUOUS EVENT WITH EVENT PRICING IS REFUSED, NEVER GUESSED ═══════════════
 *
 * An order can arrive with no `event_id`, and both order paths then fall back to the date. The menu
 * API and the submit route order that fallback DIFFERENTLY (the investigation's finding, §70.2), so
 * "the earliest event" is not even one answer — it is two. Pricing against a guess would charge a
 * festival's prices at a pub lunch, or the reverse, on an order nobody can reconstruct afterwards.
 *
 * So: where the date has more than one candidate event, this asks whether ANY of them would charge
 * something other than the menu. If none would, the order is priced at the menu and nothing is
 * ambiguous in any way that matters — which is every truck today, and is why this guard costs them
 * nothing. If any would, the caller returns the existing 409 "menu has changed" refusal, whose
 * handler already re-fetches the menu and asks the customer to look.
 *
 * ⚠️ IT ASKS ABOUT EVERY CANDIDATE, NOT ABOUT THE ONE THAT WOULD HAVE WON. The point is that we do
 * not know which would win.
 * ⚠️ A FAILED READ ANSWERS `false` — menu prices, today's behaviour — like every read in this file.
 */
export async function candidatesChangePrices(
  supabase: SupabaseClient,
  truckId: string,
  candidateEventIds: readonly string[],
): Promise<boolean> {
  if (candidateEventIds.length === 0) return false
  const { items } = await loadPricingItems(supabase, truckId)
  if (items.length === 0) return false
  for (const id of candidateEventIds) {
    const pricing = await readEventPricing(supabase, id)
    if (pricingDiffersFromMenu(pricing.resolved, items)) return true
  }
  return false
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE AUDIT FIELDS ON AN EDITED ORDER
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 `menu_price` / `price_basis` ON AN EDIT, WHERE SOME LINES ARE PRICE-LOCKED ═════════════════
 *
 * An edit is the one path where two kinds of line sit in one array:
 *   • a line ALREADY on the order keeps its STORED price (price-lock), so its audit fields are the
 *     ones that were stored WITH that price. Re-deriving them from today's event pricing would
 *     label a locked £10 line "+10%, menu £10" when the £10 it is charging is last week's menu.
 *   • a line this edit ADDED is priced from the event book, so it gets today's fields.
 *
 * 🔴 THE PAIRING IS `repriceOrder`'S OWN, DELIBERATELY REPLICATED RATHER THAN APPROXIMATED, AND THE
 * COUPLING IS NAMED HERE SO IT CANNOT DRIFT UNNOTICED. `repriceOrder` matches a submitted line to a
 * stored line by `lineIdentity` (name + modifier NAME set, notes excluded) and consumes matches from
 * a QUEUE, so two stored lines sharing an identity pair with two submitted lines **in order**. This
 * walks the submitted lines in the same order and shifts the same queues, so line *n* here is the
 * same line *n* there. Keying on the identity without the queue would give both duplicates the first
 * line's fields. `scripts/event-pricing.cjs` asserts the two agree on a duplicate-name order.
 *
 * ⚠️ IT STRIPS BEFORE IT STAMPS. Whatever the client sent in these two fields is discarded — they are
 * server-only, and a stale pair from a re-submitted modal payload reads exactly like the server's.
 *
 * @param submitted   the lines as `repriceOrder` returned them (prices already resolved)
 * @param storedItems `order.items` as the row holds it — the authority for a locked line
 * @param menuPrice   `EventPriceBook.menuPrice` — the items event pricing moved, by NAME
 * @param basisByName `EventPriceBook.basisByName` — ⚠️ PER ITEM since 5 October 2026, because one
 *                    event can charge its own price for one dish and its type's rule for another
 */
export function stampEditedLines<T extends { name?: unknown; modifiers?: unknown }>(
  submitted: readonly T[],
  storedItems: unknown,
  menuPrice: Readonly<Record<string, number>>,
  basisByName: Readonly<Record<string, PriceBasis>>,
): T[] {
  type Audit = { menu_price?: number; price_basis?: PriceBasis }
  const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : [])

  /* The stored lines' OWN audit fields, queued by identity exactly as repriceOrder queues prices.
   * ⚠️ A STORED LINE WITH NO USABLE unit_price IS SKIPPED, because repriceOrder skips it too — it
   * falls through to the menu there, so it must not consume a queue slot here. */
  const queues = new Map<string, Audit[]>()
  for (const it of asArray(storedItems)) {
    const unit = typeof it?.unit_price === 'number' ? it.unit_price : parseFloat(String(it?.unit_price ?? ''))
    if (!Number.isFinite(unit)) continue
    const key = lineIdentity(it?.name, (it?.modifiers as { name?: unknown }[] | null) ?? null)
    const audit: Audit = {}
    if (typeof it?.menu_price === 'number') audit.menu_price = it.menu_price
    if (it?.price_basis === 'event' || it?.price_basis === 'event_type') audit.price_basis = it.price_basis
    const q = queues.get(key)
    if (q) q.push(audit)
    else queues.set(key, [audit])
  }

  const anyEventPrice = Object.keys(menuPrice).length > 0
  /* ⚠️ NOTHING TO DO ⇒ THE SAME ARRAY, NOT A MAPPED COPY. An order with no stored audit fields on a
   * truck not using this feature comes back untouched, which is the byte-identity promise. */
  const anyStored = [...queues.values()].some(q => q.some(a => a.price_basis !== undefined))
  if (!anyEventPrice && !anyStored) return submitted as T[]

  return submitted.map(line => {
    const locked = (() => {
      const q = queues.get(lineIdentity(line?.name, (line?.modifiers as { name?: unknown }[] | null) ?? null))
      return q && q.length ? q.shift() : undefined
    })()
    const copy = { ...line } as T & Audit
    delete copy.menu_price
    delete copy.price_basis
    if (locked) {
      /* LOCKED: the stored line's own fields, or none if it had none. */
      if (locked.menu_price !== undefined) copy.menu_price = locked.menu_price
      if (locked.price_basis !== undefined) copy.price_basis = locked.price_basis
      return copy
    }
    /* NEW: today's event pricing, if it moved this item. ⚠️ BOTH FIELDS OR NEITHER — the two maps
     * have the same keys by construction, and the `&&` makes that a property of this code too. */
    if (anyEventPrice) {
      const name = String(line?.name ?? '')
      const menu = menuPrice[name]
      const b = basisByName[name]
      if (menu !== undefined && b !== undefined) { copy.menu_price = menu; copy.price_basis = b }
    }
    return copy
  })
}
