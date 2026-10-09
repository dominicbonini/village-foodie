// app/api/event-types/route.ts — event types: list, create, edit, reorder, delete, and assign.
//
// ── 🔴 ITS OWN ROUTE, NOT AN ACTION ON /api/manage ─────────────────────────────────────────────────
// For the reason app/api/weekly-post/route.ts gives for the same choice: /api/manage is a 3,000-line
// handler every operator write funnels through, and adding a seventh concern to it makes the one path
// that must never surprise a caller harder to reason about. The auth is the same token +
// `resolveTruckAccess` pattern, lifted rather than reinvented, and the merge cost is nil because this
// file is new.
//
// ── 🔴 THE PLAN GATE IS SERVER-SIDE ON EVERY ACTION ───────────────────────────────────────────────
// `FeatureGate` in the panel decides what is DRAWN; this decides what is DONE. Without the check here
// the whole feature is reachable by anyone holding a dashboard token and posting to this URL, and the
// UI gate would be decoration. `canAccess` is the same function the UI gate uses.
//
// ── 🔴 WHAT HAPPENS WHEN A TRUCK LOSES ACCESS (decision 4) ────────────────────────────────────────
// Reads still answer and every existing type keeps resolving, because `load` is NOT gated: an event
// that already has a type must go on behaving the same way, or a downgrade would silently change the
// service settings of events already in the diary. Every WRITE is refused, and `load` says
// `readOnly: true` so the panel can show the upgrade line instead of controls.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canAccess } from '@/lib/features'
/* 🔴 MAIN'S OWN VENUE NORMALISER, NOT A NEW ONE. `normalizeVenue` (lib/venue-signature.ts) is already
 * the matching function the scraped-event bridge dedups with, so "the same place" means here exactly
 * what it means there, and this build adds no second normaliser to main.
 * ⚠️ IT IS NOT THE SAME FUNCTION `truck_places.name_key` USES. That one — `normalisePlaceName` — lives
 * on the schedule-graphics branch, where places are a table. At the merge, "the usual type for this
 * place" should key on `truck_place_id` instead of on a normalised name, which removes this question
 * rather than answering it twice. Recorded in docs/event-types-stage1-report.md. */
import { normalizeVenue } from '@/lib/venue-signature'
import { getLocalDateInTz } from '@/lib/time-utils'
import {
  SERVICE_KEYS, MAX_TYPE_NAME, blankTypeValues, type ServiceKey,
  EVENT_OVERRIDE_COLUMNS,
} from '@/lib/event-types/types'
import { readTypesForTruck, countUpcomingByType, usualTypeForPlace } from '@/lib/event-types/read'
/* 🔴 EVENT PRICING (§70). The pricing reads are SEPARATE from `readTypesForTruck`'s own select, and
 * `lib/event-pricing/price.ts` is the only arithmetic — this route validates and writes, it never
 * computes a price. */
import {
  readTypePricingForTruck, readEventPricing, loadPricingItems,
} from '@/lib/event-pricing/read'
/* 🔴 THE "Set each price myself" LOCK-IN. The DECISION and the ARITHMETIC are in their own module so
 * `scripts/event-pricing.cjs` can put real numbers through the real code with no database at all; the
 * reads and the write stay here. See the block in `set_type_pricing`. */
import { shouldLockIn, lockedInPrices, oldSetupOf } from '@/lib/event-pricing/lock-in'
/* ⚠️ `priceAtEvent` IS NOW IMPORTED, AND THE OLD NOTE HERE IS SUPERSEDED (5 October 2026). It read
 * "NO priceForItem HERE, DELIBERATELY — the SCREENS compute". That was right while the only screen
 * computing prices was the Event types grid, which already holds the whole setup. It is WRONG for the
 * dashboard's Menu & Stock Price column: that column is shown mid-service, to every plan, and it must
 * state the price the till will take. 🔴 SO THE SERVER COMPUTES IT, with the function the submit route
 * charges with, and the column renders a number it was given. The rule the old note was protecting —
 * ONE answer, not two — is better served this way round. ⛔ The GRID is unchanged and still computes
 * client-side from the setup it is handed. */
/* ⚠️ `toPounds` IS IMPORTED RATHER THAN OPEN-CODING `/ 100`, and that is not pedantry — it is the
 * rule lib/order-repricing.ts states in capitals ("NEVER hardcode x100 or /100 at a call site: one
 * open-coded conversion is all it takes for a money value to be out by two orders of magnitude with
 * nothing to catch it"). scripts/event-pricing.cjs refuses one in this file, and it caught this. */
import {
  cleanPriceAmount, cleanTypedPrice, isPriceMode, isPriceRounding, priceAtEvent, toPounds,
  type PriceMode,
} from '@/lib/event-pricing/price'
/* 🔴 THE ONE DEFINITION OF "WHICH PLACE IS THIS EVENT AT", IMPORTED NOT RE-WRITTEN — the same
 * function the Places list uses. A second copy here would let the default type disagree with the
 * list it is derived from, with nothing to report it. */
import { placeForEvent } from '@/lib/schedule-graphics/places'
import { isIntervalChoice } from '@/lib/slot-interval-core'
import { readVanIntervalsForTruck } from '@/lib/slot-interval'
/* 🔴 "Do you take cash?" PER VAN (5 October 2026) and "Same settings for all vans" — both read
 * through their OWN probed readers, never as extra columns on the van select below. That select feeds
 * the whole grid; a 42703 on it would empty every column. */
import { readVanTakesCashForTruck } from '@/lib/payments/van-cash'
import { readVanSameAsFirst, firstVanId } from '@/lib/van-category-settings'
import { resolveVanTakesCash } from '@/lib/event-types/resolve'
import { OFFLINE_PROTECTION_MODES } from '@/lib/copy/offlineProtection'
/* 🔴 THE BUILT-IN PRIVATE TYPE (20261014). Created lazily; never upserted — see its header. */
import { ensurePrivateType, readTypeKinds } from '@/lib/private-events/type'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type TruckRow = {
  id: string; name: string
  plan: string | null
  feature_overrides: Record<string, boolean> | null
  trial_expires_at: string | null
  takes_cash: boolean | null
}

async function getTruck(token: string): Promise<TruckRow | null> {
  const { data } = await supabase.from('trucks').select('*').eq('dashboard_token', token).single()
  return (data as TruckRow | null) ?? null
}

/** The gate. ⚠️ Returns the same message the panel shows, so a blocked call and a blocked screen agree. */
const UPGRADE_MESSAGE = 'Event types are part of the Max plan.'
const allowed = (truck: TruckRow): boolean =>
  canAccess(truck.plan as never, 'event_types', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)

/* ══ 🔴 THE SECOND GATE: PRIVATE EVENTS ARE **PRO**, AND THIS SCREEN NOW SERVES BOTH (20261014) ═════
 * `event_types` is Max — making your own named presets, and the PRICES rows. `private_events` is Pro —
 * the built-in Private type, its link/QR switch, and the private link itself.
 *
 * 🔴 SO A PRO TRUCK REACHES THIS ROUTE LEGITIMATELY, which it never did before, and `allowed` alone is
 * no longer the whole answer. `load` is permitted for either key (a Pro truck must be able to see
 * Standard + Private), and every WRITE asks for the key that matches what it writes:
 *   • the Private type's own rows and the link/QR switch → `privateAllowed`
 *   • everything else (create/rename/delete a type, prices, the other service rows) → `allowed`
 * ⛔ A ROUTE THAT CHECKED ONLY `allowed` WOULD 403 EVERY PRO TRUCK OFF ITS OWN FEATURE; one that
 * checked only `privateAllowed` would hand Pro the whole Max screen. Both, each on what it guards.
 * ⚠️ THE MESSAGES DIFFER ON PURPOSE — a Pro truck told "Event types are part of the Max plan" while
 * looking at a screen they are entitled to would have no idea what to do. */
const PRIVATE_UPGRADE_MESSAGE = 'Private events are part of the Pro plan.'
const privateAllowed = (truck: TruckRow): boolean =>
  canAccess(truck.plan as never, 'private_events', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)

/**
 * One setting from a request body, validated.
 *
 * 🔴 `undefined` MEANS "DO NOT TOUCH THIS KEY" AND `null` MEANS "SAME AS STANDARD". Those are two
 * different instructions and collapsing them would make a partial save wipe the settings it did not
 * mention — the rule `update_settings` follows for exactly this reason.
 * ⚠️ ANYTHING UNRECOGNISED BECOMES NULL, not an error. The vocabulary is three booleans and one of
 * five intervals; a value outside it cannot be honoured, and "same as Standard" is the only safe
 * reading of a value nobody can act on.
 */
function cleanValue(key: ServiceKey, raw: unknown): boolean | number | string | null {
  if (key === 'collection_interval_mins') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return isIntervalChoice(n) ? n : null
  }
  /* 🔴 THE MODE'S VOCABULARY IS THE COPY MODULE'S, not a pair of literals written here. Anything else
   * becomes NULL ("same as Standard"), which is also what the database CHECK would allow. */
  if (key === 'offline_protection_mode') {
    return OFFLINE_PROTECTION_MODES.some(m => m.value === raw) ? String(raw) : null
  }
  /* 🔴 5-30, THE SAME BOUNDS the van column's CHECK, this type's CHECK and `set_offline_protection`
   * all use. The picker's six values are a UI affordance; any integer in range is accepted, exactly
   * as the van column accepts one. */
  if (key === 'offline_auto_reject_mins') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isInteger(n) && n >= 5 && n <= 30 ? n : null
  }
  return raw === true ? true : raw === false ? false : null
}

const cleanName = (raw: unknown): string =>
  String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TYPE_NAME)

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PRICING (§70) — WHAT THIS ROUTE VALIDATES AND WRITES. IT COMPUTES NOTHING.
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 EVERY PRICE A SCREEN DISPLAYS IS COMPUTED BY lib/event-pricing/price.ts, AND SO IS EVERY PRICE
// THE ORDER PATHS CHARGE. This route's job is the three boring ones: validate what arrived, write it,
// and hand the screens the inputs (the menu, the categories, each setup's rule and typed rows) so
// they can run the same function the server does. A `priceForItem` call here that the client did not
// also make is a number the operator is promised and not charged.

/** The menu items the grid and the sheet price, with their categories in MENU order. */
async function loadMenuForPricing(truckId: string) {
  const [{ items }, { data: cats }] = await Promise.all([
    loadPricingItems(supabase, truckId),
    supabase.from('menu_categories')
      .select('id, name, sort_order')
      .eq('truck_id', truckId).eq('is_active', true)
      .order('sort_order', { ascending: true }).order('name'),
  ])
  const catRows = (cats as { id: string; name: string; sort_order: number | null }[] | null) ?? []
  /* ⚠️ THE CATEGORY ORDER IS `menu_categories.sort_order`, THE SAME ORDER THE CUSTOMER MENU USES
   * (app/api/menu/[truckId]/route.ts orders by sort_order then name). An operator reading prices down
   * the grid is reading their own menu; a different order here would make them hunt. */
  const byCat = new Map<string, { id: string; name: string; price: number }[]>()
  for (const it of items) {
    const key = it.categoryId ?? '\u0000uncategorised'
    const bucket = byCat.get(key) ?? []
    bucket.push({ id: it.id, name: it.name, price: toPounds(it.pricePence) })
    byCat.set(key, bucket)
  }
  const categories = catRows
    .map(c => ({ id: c.id, name: c.name, items: byCat.get(c.id) ?? [] }))
    .filter(c => c.items.length > 0)
  /* ⚠️ AN ITEM WITH NO CATEGORY (or whose category is inactive) IS STILL PRICEABLE and still gets a
   * row, under the name the customer menu gives it. Dropping it would hide a dish from the one screen
   * that sets its price while the order path still charged for it. */
  const orphan = items.filter(it => !it.categoryId || !catRows.some(c => c.id === it.categoryId))
  if (orphan.length) {
    categories.push({
      id: '\u0000uncategorised', name: 'Uncategorized',
      items: orphan.map(it => ({ id: it.id, name: it.name, price: toPounds(it.pricePence) })),
    })
  }
  return { categories }
}

/** The grid's pricing payload: every type's setup and typed rows, plus the menu. */
async function loadPricingPayload(truckId: string) {
  const [typePricing, menu] = await Promise.all([
    readTypePricingForTruck(supabase, truckId),
    loadMenuForPricing(truckId),
  ])
  /* ⚠️ `pricingReady: false` MEANS "20261011 IS NOT APPLIED", and the grid draws no PRICES section
   * rather than controls that would 400. It is the same honesty `missingTable` already provides for
   * the types themselves. */
  if (!typePricing.ok) return { pricingReady: false as const }
  return {
    pricingReady: true as const,
    pricing: Object.fromEntries(
      [...typePricing.byTypeId.entries()].map(([id, t]) => [id, {
        price_change_on: t.price_change_on === true,
        price_mode: isPriceMode(t.price_mode) ? t.price_mode : 'none',
        price_amount: t.price_amount === null || t.price_amount === undefined ? null : Number(t.price_amount),
        price_rounding: isPriceRounding(t.price_rounding) ? t.price_rounding : 'none',
        typed: typePricing.typedByTypeId.get(id) ?? {},
      }]),
    ),
    menu,
  }
}

/** Every typed price for ONE event, gone. Used by `clearOwn`, the sheet's clear, and the card's Reset. */
async function deleteEventItemPrices(eventId: string) {
  const { error } = await supabase.from('event_item_prices').delete().eq('event_id', eventId)
  /* ⚠️ A FAILURE IS LOGGED, NOT THROWN. The caller is clearing a hand change; the COLUMNS are the
   * thing that decides whether the rows are read at all (`price_own` false ⇒ nothing reads them), so
   * a failed delete leaves orphan rows that change no price. Throwing would fail a reset that had
   * already done the part that matters. ⚠️ They are NOT orphans forever: choosing "Own prices" again
   * replaces the whole set (see `save_event_pricing`). */
  if (error) console.warn(`[event-pricing] could not clear typed prices for event ${eventId}:`, error.message)
}

/**
 * The three pricing columns from a request body, validated.
 *
 * 🔴 THE AMOUNT IS VALIDATED **AGAINST THE MODE**, because "10" means £10 or 10% depending on it and
 * the two have different ceilings. `cleanPriceAmount` is the one implementation and the screens call
 * it too, so a value the box accepts is a value this route stores.
 * ⚠️ AN UNRECOGNISED MODE OR ROUNDING BECOMES THE SAFE ONE ('none'), NOT AN ERROR — the same reading
 * `cleanValue` above gives a service value nobody can act on. A 400 here would block a save over a
 * value the operator cannot see or correct.
 */
function cleanPricingPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  let mode: PriceMode | null = null
  if ('price_mode' in body) {
    mode = isPriceMode(body.price_mode) ? body.price_mode : 'none'
    patch.price_mode = mode
  }
  if ('price_rounding' in body) {
    patch.price_rounding = isPriceRounding(body.price_rounding) ? body.price_rounding : 'none'
  }
  if ('price_amount' in body) {
    /* ⚠️ THE MODE FROM THIS SAME BODY WHEN IT CARRIES ONE. The grid sends mode and amount together on
     * a mode change, and validating the amount against the OLD stored mode would reject "10" as a
     * percentage because the stored mode was still '+ £'. */
    patch.price_amount = cleanPriceAmount(mode, body.price_amount)
  }
  return patch
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VAN 1'S RESOLVED SERVICE VALUES — WHAT A NEW TYPE IS A COPY OF (5 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * ── 🔴 AN EVENT TYPE NOW HOLDS ITS OWN VALUES, AND THIS IS WHERE THEY COME FROM ───────────────────
 * Dominic, 5 October 2026: "A new type starts as a COPY of Van 1's resolved service values… Service
 * rows no longer draw faded 'following' values. Every cell is that column's own value. Changing
 * Standard never changes a type."
 *
 * ⛔ WHAT THIS REPLACES. A new type was `blankTypeValues()` — every column NULL, meaning "same as
 * Standard" — and the grid drew each NULL cell FADED at the first van's value. That is what produced
 * the second half of the localhost report: turning on cash for Van 1 "showed Market changing", because
 * Market was never showing its OWN value; it was showing Van 1's, faded, and Van 1's had moved.
 *
 * 🔴 A COPY AT CREATION IS THE FIX, AND IT IS A FIX BY CONSTRUCTION. With a real value in every
 * column there is nothing to inherit, so no Standard edit can reach a type — the resolver is not
 * consulted for a column that is not NULL.
 *
 * ⚠️ THE RESOLVER CHAIN IS UNCHANGED AND STILL FALLS BACK, deliberately: every type that exists
 * TODAY has NULLs, and until 20261012's backfill is run those rows must go on resolving exactly as
 * they do now. This changes what a NEW type starts as; it does not change how an OLD one reads.
 * ⚠️ `offline_auto_reject_mins` IS **NOT** COPIED. It is not offered on a type at all (Dominic's
 * 4 October decision — the only thing that acts on it is a plpgsql function that cannot read this
 * resolver), so seeding it would store a value no screen shows and nothing uses.
 * 🔴 "VAN 1" IS THE OLDEST ACTIVE VAN — `firstVanId`, the ONE rule that phrase means everywhere else
 * in this product. Not "the first row PostgREST returned".
 */
async function vanOneServiceValues(
  truckId: string,
  truckTakesCash: boolean | null,
): Promise<Pick<EventTypeServiceValues, ServiceKey>> {
  const blank = blankTypeValues()
  /* ⚠️ `select('*')`, NOT A NAMED SELECT. This runs where a missing column would otherwise take the
   * whole thing down, and `vanCopyPayload`'s own comment makes the same argument for the same read. */
  const { data: vans } = await supabase
    .from('truck_vans').select('*').eq('truck_id', truckId)
    .eq('active', true).order('created_at', { ascending: true })
  const rows = (vans as Record<string, unknown>[] | null) ?? []
  if (rows.length === 0) return blank
  const first = rows.find(v => v.id === firstVanId(
    rows as Array<{ id: string; active?: boolean | null; created_at?: string | null }>,
  )) ?? rows[0]

  /* The collection grid comes from the PROBED reader, never from the select above — the rule
   * scripts/slot-interval-van-list-tolerance.cjs enforces. */
  const grids = await readVanIntervalsForTruck(supabase, truckId)
  const customer = grids.byVanId.get(String(first.id))?.customer ?? null

  return {
    ...blank,
    /* 🔴 EACH VALUE IS THE ONE THAT WOULD ACTUALLY HAVE BEEN USED, resolved the same way the screens
     * resolve it — not the raw column. `buzzer_prompt` is "this van has a rack" (lib/buzzer.ts's
     * rule), and `takes_cash` is `van ?? truck`. */
    buzzer_prompt: (first.buzzer_count ?? null) !== null,
    takes_cash: resolveVanTakesCash(first.takes_cash as boolean | null, truckTakesCash),
    order_ready: first.order_ready_enabled === true,
    collection_interval_mins: customer !== null && isIntervalChoice(customer) ? customer : null,
    offline_protection: first.auto_pause_on_offline === true,
    offline_protection_mode: OFFLINE_PROTECTION_MODES.some(m => m.value === first.offline_protection_mode)
      ? String(first.offline_protection_mode) as never
      : 'pause' as never,
  }
}

/** The shape `vanOneServiceValues` fills — the service columns and nothing else. */
type EventTypeServiceValues = Record<ServiceKey, boolean | number | string | null>

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const token = String(body.token ?? '')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const action = String(body.action ?? '')
  const canWrite = allowed(truck)

  /* 🔴 ONE GUARD, APPLIED TO EVERY ACTION BUT `load`. Listing the write actions rather than the read
   * one means a NEW action added later is refused by default instead of being accidentally open. */
  /* ⚠️ TWO READS ARE EXEMPT, NOT ONE. `event_pricing_summary` joined `load` because a DOWNGRADED
   * truck's saved prices KEEP RESOLVING (decision 8) and the dashboard card has to go on describing
   * them accurately — a 403 there would show "Menu prices" over an event charging +10%. Every other
   * action, including any added later, is refused by default. */
  const READ_ACTIONS = new Set(['load'])

  /* ══ 🔴 PER-EVENT ITEM PRICES ARE ON **EVERY PLAN** (5 October 2026) ══════════════════════════════
   * "This one dish costs more tonight" is a hatch-side decision every truck makes, and it is not the
   * same product as an event TYPE's price rule — which stays Max, because that is the one that needs
   * types to exist at all. So these two actions are exempt from BOTH gates above.
   * ⛔ THEY TOUCH NO `event_types` ROW. The read returns computed prices and the write touches exactly
   * one `event_item_prices` row keyed on `event_id` — so a Starter truck using them cannot reach any
   * part of the Max feature, which is what makes the exemption safe rather than a hole.
   * ⚠️ LISTED EXPLICITLY, LIKE THE OTHER TWO SETS, so an action added later is Max-gated by default.
   * ⛔ `event_pricing_summary`, `load_event_pricing`, `save_event_pricing` AND `clear_event_pricing`
   * ARE GONE from this route — they served the whole-event "own prices" rule and its sheet, both
   * deleted. `READ_ACTIONS` is back to `load` alone. */
  const ALL_PLAN_ACTIONS = new Set(['event_item_prices', 'save_event_item_prices'])

  /* ══ 🔴 THE PRO HALF OF THE SCREEN (20261014) ═══════════════════════════════════════════════════
   * These actions write the PRIVATE type and its link/QR switch, which is a `private_events` (Pro)
   * feature, not an `event_types` (Max) one. They are listed explicitly rather than detected, so an
   * action added later is Max-gated by default — the same default-closed discipline READ_ACTIONS has.
   * ⛔ A MAX TRUCK PASSES THIS TOO: `MAX_FEATURES` spreads `PRO_FEATURES`, so `privateAllowed` is true
   * for pro, max, trial, tester and demo. It is a FLOOR, not an alternative tier. */
  const PRIVATE_ACTIONS = new Set(['set_private_link_ordering'])
  if (PRIVATE_ACTIONS.has(action)) {
    if (!privateAllowed(truck)) {
      return NextResponse.json({ error: PRIVATE_UPGRADE_MESSAGE, upgrade: true }, { status: 403 })
    }
  } else if (!ALL_PLAN_ACTIONS.has(action) && !READ_ACTIONS.has(action) && !canWrite) {
    return NextResponse.json({ error: UPGRADE_MESSAGE, upgrade: true }, { status: 403 })
  }

  /* ⛔ AND `load` IS OPEN TO EITHER KEY. A Pro truck must be able to SEE Standard + Private; without
   * this it would reach a screen it is entitled to and be told to upgrade. */
  if (READ_ACTIONS.has(action) && !canWrite && !privateAllowed(truck)) {
    return NextResponse.json({ error: UPGRADE_MESSAGE, upgrade: true }, { status: 403 })
  }

  /* ══ 🔴 THE PRICE CUSTOMERS PAY AT THIS EVENT, PER ITEM — EVERY PLAN ══════════════════════════════
   * Feeds the dashboard's Menu & Stock Price column. 🔴 THE NUMBERS ARE COMPUTED HERE, BY
   * `priceAtEvent` — the same function the submit route charges with and the menu API shows — so the
   * column, the customer's menu and the order cannot disagree. A client-side `menu × rule` expression
   * is exactly how a screen comes to promise a price the till does not take.
   * ⚠️ TWO MAPS, BOTH KEYED BY `menu_items_db.id`:
   *     charged  — every item whose price MOVED from the menu. Absent ⇒ the menu price.
   *     eventOwn — the subset THIS EVENT typed. Absent ⇒ it is following the type, or the menu.
   * The column needs both: the first is what to show, the second is whether to show it as changed
   * with an × beside it. */
  if (action === 'event_item_prices') {
    const eventId = String(body.eventId ?? '')
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    const { data: ev } = await supabase
      .from('truck_events').select('id, status').eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    const pricing = await readEventPricing(supabase, eventId)
    const { items } = await loadPricingItems(supabase, truck.id)
    const charged: Record<string, number> = {}
    const fallback: Record<string, number> = {}
    /* 🔴 THE PRICE THIS ITEM WOULD BE **WITHOUT** THE EVENT'S OWN, computed by the same function with
     * the event's typed set emptied. That is what the blue line under a changed price names — "menu
     * £12.00 · this event", or "<Type> £12.00 · this event" when the TYPE is what it is departing
     * from — and it is the one figure the operator cannot see while their own number is on screen.
     * ⛔ NOT `item.price`. Deriving the line from the menu price would label an event price that
     * departs from a Festival rule as departing from the menu, which is a different claim. */
    const withoutEvent = { ...pricing.resolved, eventTyped: {} }
    for (const it of items) {
      const { pence, basis } = priceAtEvent(it.pricePence, it.id, pricing.resolved)
      if (basis !== null) charged[it.id] = toPounds(pence)
      if (pricing.eventTyped[it.id] !== undefined) {
        fallback[it.id] = toPounds(priceAtEvent(it.pricePence, it.id, withoutEvent).pence)
      }
    }
    return NextResponse.json({
      ok: pricing.ok,
      /* ⚠️ "LIVE" IS THE STATUS, NOT THE CLOCK. `open` is what the dashboard puts an event into when
       * service starts, and the live note in edit mode keys on this — so the server and the screen
       * cannot disagree about whether orders are being taken. */
      live: ev.status === 'open',
      /* ⚠️ THE TYPE'S NAME IS SENT ONLY WHEN ITS PRICING IS ON. The blue line says "<Type> £12.00"
       * exactly when the fallback IS the type's price; a type whose switch is off contributes nothing
       * and the line must say "menu". Sending the name regardless would invite the screen to decide. */
      typeName: pricing.resolved.typeSetup ? pricing.typeName : null,
      charged,
      fallback,
      eventOwn: pricing.eventTyped,
    })
  }

  /* ══ 🔴 THIS EVENT'S PRICES, SAVED IN ONE GO — EVERY PLAN ════════════════════════════════════════
   *
   * 🔴 A BATCH, NOT ONE ITEM AT A TIME (5 October 2026). The Price column is read-only until the
   * operator presses "✎ Edit prices", and nothing is written until they press "Save prices" — so what
   * arrives here is the complete set of CHANGES from one editing session, and Cancel means no request
   * was ever made. A per-item write would have made Cancel impossible to implement honestly.
   *
   * ⛔ `null` CLEARS, AND CLEARING IS A **DELETE**, NOT A £0, for the reason `set_type_item_price`
   * records: the only way to say "follow the type/menu again" is for the row to be ABSENT, because £0
   * is a real and different instruction ("free tonight").
   * ⛔ AND IT WRITES NO COLUMN ON `truck_events`. The old path set `price_own = true` and a rule
   * alongside; that rule is gone and those columns are read by nothing. Touching them here would
   * resurrect the thing this change removed.
   *
   * ⚠️ THE DELETES AND THE UPSERTS ARE TWO STATEMENTS AND IT IS NOT A TRANSACTION, because PostgREST
   * cannot give me one. What makes that safe is that NO INTERMEDIATE STATE MISPRICES: a row that is
   * deleted but not yet re-inserted resolves to the type or the menu, which is a legitimate price the
   * operator has seen; and each statement is single, so no half-set of prices can exist.
   */
  if (action === 'save_event_item_prices') {
    const eventId = String(body.eventId ?? '')
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    const { data: ev } = await supabase
      .from('truck_events').select('id').eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const raw = (body.prices && typeof body.prices === 'object' ? body.prices : {}) as Record<string, unknown>
    /* ⚠️ EVERY ITEM ID IS CHECKED AGAINST THIS TRUCK'S OWN ITEMS. The map arrives from a client and
     * `event_item_prices` is service-role only, so this handler IS the scope check. An id that is not
     * this truck's is DROPPED, not 400'd — it can only come from a stale screen (a dish deleted while
     * the editor was open), and refusing the whole save over one vanished dish would lose the
     * operator's other twenty prices. */
    const { items: ownItems } = await loadPricingItems(supabase, truck.id)
    const ownIds = new Set(ownItems.map(i => i.id))
    const rows: Record<string, unknown>[] = []
    const clear: string[] = []
    const dropped: string[] = []
    for (const [itemId, value] of Object.entries(raw)) {
      if (!ownIds.has(itemId)) { dropped.push(itemId); continue }
      const price = cleanTypedPrice(value)
      if (price === null) { clear.push(itemId); continue }
      rows.push({
        truck_id: truck.id, event_id: eventId, event_type_id: null, item_id: itemId,
        price, updated_at: new Date().toISOString(),
      })
    }
    if (dropped.length) {
      console.warn(`[event-pricing] save for event ${eventId}: dropped ${dropped.length} price(s) for items that are not truck ${truck.id}'s`)
    }

    if (clear.length) {
      const { error } = await supabase.from('event_item_prices')
        .delete().eq('event_id', eventId).in('item_id', clear)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (rows.length) {
      /* ⚠️ `onConflict` NAMES A **PLAIN** UNIQUE CONSTRAINT — `event_item_prices_event_item_key
       * UNIQUE (event_id, item_id)`, added by 20261013 precisely because PostgREST cannot infer a
       * conflict against a PARTIAL index (42P10). See the long note on `set_type_item_price`. */
      const { error } = await supabase.from('event_item_prices').upsert(rows, { onConflict: 'event_id,item_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, saved: rows.length, cleared: clear.length })
  }

  /* ── 🔴 THE PRIVATE TYPE'S ONE EXTRA ROW: "Take orders by private link and QR code" ─────────────
   * Writes `event_types.private_link_ordering` on the kind='private' row and nothing else.
   * ⛔ IT CREATES THE PRIVATE TYPE IF IT IS NOT THERE YET, through `ensurePrivateType` — the operator
   * may reach this row before they have ever made an event private, and a switch that silently did
   * nothing until some other action happened first would be a switch that lies.
   * ⛔ AND IT CANNOT WRITE ANY OTHER TYPE. The update is filtered on `kind = 'private'` as well as on
   * the truck, so a forged id cannot turn a custom type into a private one. */
  if (action === 'set_private_link_ordering') {
    const on = body.on === true
    /* The lazy creation copies Van 1's RESOLVED values, exactly as a new custom type does (§70.10) —
     * so Private starts where the truck already is rather than at some invented default. */
    const seed = await vanOneServiceValues(truck.id, truck.takes_cash ?? null)
    const type = await ensurePrivateType(supabase, truck.id, {
      buzzer_prompt: seed.buzzer_prompt as boolean | null,
      takes_cash: seed.takes_cash as boolean | null,
      order_ready: seed.order_ready as boolean | null,
      collection_interval_mins: seed.collection_interval_mins as number | null,
    })
    if (!type) {
      return NextResponse.json(
        { error: 'Private events are not available yet — the database migration has not been applied.' },
        { status: 400 },
      )
    }
    const { error } = await supabase
      .from('event_types')
      .update({ private_link_ordering: on, updated_at: new Date().toISOString() })
      .eq('id', type.id)
      .eq('truck_id', truck.id)
      .eq('kind', 'private')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, on })
  }

  // ── LOAD ────────────────────────────────────────────────────────────────────────────────────────
  if (action === 'load') {
    const { ok, types } = await readTypesForTruck(supabase, truck.id)
    const counts = await countUpcomingByType(supabase, truck.id, getLocalDateInTz())

    /* ══ 🔴 THE BUILT-IN PRIVATE TYPE, ENSURED ON LOAD (20261014, decision 1) ═══════════════════════
     * "Every truck's Event types grid shows Standard and Private by default." The row is created
     * LAZILY — here, the first time the grid is opened — rather than backfilled across every truck,
     * which is why 20261014 writes no rows of its own.
     * ⛔ ONLY FOR A TRUCK ENTITLED TO IT, AND ONLY THE TOKEN'S OWN TRUCK. `ensurePrivateType` takes
     * `truck.id` and there is no branch here that could reach another one — which is what keeps
     * "never write on another truck's behalf" true while testing on Pizza Kitchen.
     * ⚠️ IT IS NOT AN ERROR IF IT FAILS. A missing 20261014 returns null and the grid simply draws no
     * Private column; the feature is not available yet, which is true. */
    if (privateAllowed(truck)) {
      const seed = await vanOneServiceValues(truck.id, truck.takes_cash ?? null)
      await ensurePrivateType(supabase, truck.id, {
        buzzer_prompt: seed.buzzer_prompt as boolean | null,
        takes_cash: seed.takes_cash as boolean | null,
        order_ready: seed.order_ready as boolean | null,
        collection_interval_mins: seed.collection_interval_mins as number | null,
      })
    }
    /* `kind` and the link/QR switch, from their own probed read — NOT from TYPE_COLS. See
     * `readTypeKinds`: that select also feeds the SERVICE resolver, and one missing column there
     * would take collection times down with it. */
    const kinds = await readTypeKinds(supabase, truck.id)

    /* ── STANDARD'S OWN VALUES, SO THE FIRST COLUMN CAN SHOW THEM ───────────────────────────────
     * 🔴 STANDARD IS NOT A ROW. It is the absence of a type, so its values are read from where they
     * actually live: the truck for cash, and the VANS for the mark-ready step, the buzzer rack and the
     * collection grid.
     * ⚠️ THE VANS MAY DISAGREE, and the screen says "Set per van" when they do rather than picking
     * one and presenting it as the truck's setup. A truck with two vans configured differently has no
     * single Standard for those settings, and inventing one would be a lie on the one column that is
     * meant to be the truth. */
    /* 🔴 TWO READS, AND THE SPLIT IS NOT TIDINESS — IT IS A RULE WITH A HARNESS BEHIND IT.
     * `scripts/slot-interval-van-list-tolerance.cjs` scans every file for a `truck_vans` select that
     * names `collection_interval_mins` ALONGSIDE other van fields, and refuses it: one 42703 on the
     * interval column would fail the WHOLE statement and take the other fields down with it. The
     * intervals therefore come from `readVanIntervalsForTruck`, which is the ONE probed reader for
     * them and degrades to "every van reads 5" on its own. This select names no interval column.
     * ⚠️ THE FIRST DRAFT OF THIS HANDLER SELECTED ALL THREE TOGETHER and that harness caught it. */
    const [{ data: vans }, vanGrids, vanCash, sameAs] = await Promise.all([
      supabase.from('truck_vans')
        /* ⚠️ STILL NO INTERVAL COLUMN HERE — scripts/slot-interval-van-list-tolerance.cjs refuses a
         * `truck_vans` select that mixes `collection_interval_mins` with other van fields, because one
         * 42703 would fail the whole statement. The grid comes from `readVanIntervalsForTruck` below. */
        /* 🔴 `name` ADDED (v3). The Standard column now shows ONE CONTROL PER VAN where the vans
         * differ, and each is labelled with its van's name — so the name is part of the answer, not
         * decoration. Everything else here is unchanged.
         * ⚠️ STILL NO INTERVAL COLUMN. See the two-reads note above; that has not changed. */
        .select('id, name, order_ready_enabled, buzzer_count, auto_pause_on_offline, offline_protection_mode')
        /* 🔴 OLDEST ACTIVE FIRST, BECAUSE THE COLUMN ORDER IS NOW THE VAN ORDER (v3 addition).
         * Dominic: "one column per active van, first van first (oldest active van)". Without an
         * explicit order PostgREST returns whatever the planner gives, so the columns could reorder
         * between loads — an operator would watch Van 1 and Van 2 swap places after a save.
         * ⚠️ `created_at` IS THE SAME RULE "the first van" MEANS EVERYWHERE ELSE in this product:
         * the oldest ACTIVE van, which is why the `active` filter sits beside it rather than after it. */
        .eq('truck_id', truck.id).eq('active', true)
        .order('created_at', { ascending: true }),
      readVanIntervalsForTruck(supabase, truck.id),
      /* 🔴 TWO MORE PROBED READS (5 October 2026), each with its own blast radius. `takes_cash` is
       * added by 20261012 and `same_as_first_van` by the "Same as Van 1" migration; naming either on
       * the van select above would empty the grid on a 42703. Both degrade to "no van has an
       * opinion / every switch off", which is the pre-migration truth. */
      readVanTakesCashForTruck(supabase, truck.id),
      readVanSameAsFirst(supabase, truck.id),
    ])

    const vanRows = (vans as {
      id: string; name?: string | null
      order_ready_enabled?: boolean | null; buzzer_count?: number | null
      auto_pause_on_offline?: boolean | null; offline_protection_mode?: string | null
    }[] | null) ?? []
    const distinct = <T,>(pick: (v: typeof vanRows[number]) => T): { same: boolean; value: T | null } => {
      if (vanRows.length === 0) return { same: true, value: null }
      const first = pick(vanRows[0])
      return { same: vanRows.every(v => pick(v) === first), value: first }
    }
    const ready = distinct(v => v.order_ready_enabled ?? false)
    const rack = distinct(v => (v.buzzer_count ?? null) !== null)
    /* ⚠️ OFFLINE PROTECTION'S STANDARD IS THE VAN'S SWITCH AND MODE TOGETHER, summarised as one
     * string because the modal shows it as one row. "Set per van" when the vans disagree on either. */
    const offSwitch = distinct(v => v.auto_pause_on_offline === true)
    const offMode = distinct(v => (v.offline_protection_mode ?? 'pause'))
    /* ⚠️ THE CUSTOMER GRID, NOT THE OPERATOR ONE — a type sets only the customer grid, so Standard's
     * column must show the same thing a type would be replacing. */
    const gridValues = vanRows.map(v => vanGrids.byVanId.get(v.id)?.customer ?? 5)
    const grid = {
      same: gridValues.length === 0 || gridValues.every(g => g === gridValues[0]),
      value: gridValues.length ? gridValues[0] : null,
    }

    return NextResponse.json({
      missingTable: !ok,
      readOnly: !canWrite,
      upgradeMessage: canWrite ? null : UPGRADE_MESSAGE,
      /* ══ 🔴 PRIVATE IS **FIRST** AMONG THE TYPES — STRAIGHT AFTER STANDARD (5 October 2026) ══════
       * It was last. Dominic reversed it, and the reason is that Private is the one column every
       * truck has: putting it after however many custom types a truck happens to have made meant its
       * position moved from truck to truck, and on a six-type truck it was off the right-hand edge
       * behind a sideways scroll — the one column nobody can create or delete, hardest to reach.
       * Straight after Standard it is always in the same place, and always visible.
       *
       * 🔴 SORTED HERE RATHER THAN TRUSTED TO `sort_order`, which is the part that has not changed.
       * `sort_order` is the CUSTOM types' order, which the operator arranges with Move left/right; a
       * built-in that competed for the same numbering would be dragged about by it.
       * ⚠️ `kind` DEFAULTS TO 'custom' when the probe could not read it, so a pre-migration load
       * returns exactly the order it returned before this build. */
      types: types
        .map(t => ({
          ...t,
          upcoming: counts[t.id] ?? 0,
          kind: kinds.byId.get(t.id)?.kind ?? 'custom',
          private_link_ordering: kinds.byId.get(t.id)?.private_link_ordering ?? true,
        }))
        .sort((a, b) => {
          /* Private sorts BEFORE every custom type; customs keep their own order among themselves. */
          const ap = a.kind === 'private' ? 0 : 1
          const bp = b.kind === 'private' ? 0 : 1
          if (ap !== bp) return ap - bp
          return (a.sort_order ?? 0) - (b.sort_order ?? 0)
        }),
      /* So the grid knows whether to draw the ORDERING section and the Max badges. */
      canPrivate: privateAllowed(truck),
      canTypes: canWrite,
      /* ── 🔴 THE ACTIVE VANS' IDS, BECAUSE STANDARD IS NOW EDITABLE ─────────────────────────
       * Changing a Standard row writes to EVERY active van, and it does so by calling the SAME
       * `update_van_settings` action Settings calls — once per van, with the same payload shape. That
       * action takes a `vanId`, so the modal has to know them.
       * ⚠️ IDS ONLY. The VALUES stay in `standard` below, where they are already aggregated with their
       * "do the vans agree" flag. Sending the rows themselves would give the modal a second, unprobed
       * copy of van state to drift from — and the interval columns in particular must not be read in
       * the same select as the rest (see the two-reads note above).
       * ⚠️ ORDER IS THE SELECT'S ORDER AND NOTHING DEPENDS ON IT. The modal writes to all of them. */
      vanIds: vanRows.map(v => v.id),
      /* ══ 🔴 "SAME SETTINGS FOR ALL VANS" — THE EXISTING FLAG, NOT A NEW ONE (5 October 2026) ════
       * Dominic: "It reads and writes the EXISTING truck_vans.same_as_first_van through Settings' own
       * action. No new flag."
       *
       * 🔴 ON WHEN EVERY NON-FIRST ACTIVE VAN HAS IT ON; ANY MIX READS OFF. The answer is READ, never
       * stored — the same model Menu › Kitchen capacity uses for its own switch, and for the same
       * reason: there is no truck-level column, so "are they all the same?" is a question about the
       * vans and inventing a column to cache it would give two answers that could disagree.
       * ⚠️ NOTHING IS WRITTEN ON LOAD.
       * ⚠️ THE FIRST VAN IS NOT IN THE TEST — it cannot follow itself, and the handler refuses it. */
      sameSettingsAllVans: (() => {
        const first = firstVanId(
          [...sameAs.createdAt.entries()].map(([id, created_at]) => ({
            id, created_at, active: sameAs.activeById.get(id) !== false,
          })),
        )
        const others = vanRows.filter(v => v.id !== first)
        return others.length > 0 && others.every(v => sameAs.byVanId.get(v.id) === true)
      })(),
      /* 🔴 FALSE ⇒ THE "Same as Van 1" MIGRATION IS NOT APPLIED, and the VANS row is not drawn. */
      sameSettingsAvailable: sameAs.ok,
      /* 🔴 FALSE ⇒ 20261012 IS NOT APPLIED. The cash row still draws (it has always drawn) but it
       * writes `trucks.takes_cash` as before, because there is no per-van column to write. */
      vanCashAvailable: vanCash.ok,
      /* 🔴 VAN 1'S RESOLVED SERVICE VALUES — what "+ New event type" and "Match Standard" copy. Sent
       * so the grid can SHOW what the copy would be before the operator presses, and computed on the
       * SERVER so the copy the screen promises is the copy the route makes. */
      vanOneValues: await vanOneServiceValues(truck.id, truck.takes_cash ?? null),
      /* ── 🔴 THE VANS THEMSELVES, BECAUSE "Set per van" IS NO LONGER AN ANSWER ────────────────────
       * Dominic, 4 October 2026: every Standard value must be changeable in the modal, and there are
       * to be no "Settings" links. So where the vans disagree the Standard cell renders one control
       * PER VAN, each labelled with that van's name and each saving to that van alone — which means
       * the modal needs each van's own value, not only the aggregate.
       * ⚠️ THE AGGREGATE (`standard`, below) STAYS AND IS STILL WHAT DECIDES. `perVan` is computed
       * here, from these same rows; the client does not re-derive it. These values are for RENDERING
       * the per-van controls, so the two can never disagree about whether the vans differ.
       * ⚠️ `takes_cash` IS ABSENT ON PURPOSE — it is `trucks.takes_cash`, one value for the whole
       * truck, so it has no per-van form and its Standard cell is always a single control.
       * ⚠️ THE INTERVAL COMES FROM `vanGrids`, THE PROBED READER, and defaults to 5 exactly as the
       * aggregate does — never from the select above, which must not name that column. */
      vans: vanRows.map(v => ({
        id: v.id,
        name: v.name ?? 'Van',
        order_ready: v.order_ready_enabled === true,
        /* 🔴 THE BUZZER ROW'S VALUE IS THE RACK — `buzzer_count !== null`, lib/buzzer.ts's rule — and
         * that is now also what Standard's switch WRITES, through the same `update_van_settings`
         * call Settings' own buzzer toggle makes. The count travels so turning it back on can restore
         * a rack size rather than inventing one. */
        buzzer_prompt: (v.buzzer_count ?? null) !== null,
        buzzer_count: v.buzzer_count ?? null,
        offline_enabled: v.auto_pause_on_offline === true,
        offline_mode: v.offline_protection_mode ?? 'pause',
        collection_interval_mins: vanGrids.byVanId.get(v.id)?.customer ?? 5,
        /* ── 🔴 THIS VAN'S OWN CASH SETTING, RESOLVED (5 October 2026) ─────────────────────────
         * `truck_vans.takes_cash ?? trucks.takes_cash`, through `resolveVanTakesCash` — the SAME
         * function Settings' per-van switch draws its position from, so the grid and Settings cannot
         * disagree about one van. Before 20261012 the map is empty and every van resolves to the
         * truck value, which is exactly what the grid showed before this change. */
        takes_cash: resolveVanTakesCash(vanCash.byVanId.get(v.id) ?? null, truck.takes_cash ?? null),
        /* The RAW value too, so the grid knows whether this van has an opinion of its own. */
        takes_cash_own: vanCash.byVanId.get(v.id) ?? null,
      })),
      /* ── 🔴 PRICING, ONLY WHEN THE CALLER ASKS (§70) ─────────────────────────────────────────
       * `withPrices` is sent by the Event types GRID and by nothing else. The Add event modal's type
       * picker calls the same `load` and has no use for prices, and these are two extra selects plus
       * the menu — so they are opt-in rather than paid for on every mount of that modal.
       * ⚠️ PROBED AND FAIL-OPEN. Before 20261011 is applied, `pricing` is absent from the response
       * and the grid draws no PRICES section — which is honest: there is nowhere to store a price. */
      ...(body.withPrices === true ? await loadPricingPayload(truck.id) : {}),
      /* What the Standard column shows. `perVan: true` ⇒ the screen prints "Set per van". */
      standard: {
        /* ⚠️ THE BUZZER PROMPT'S DEFAULT IS "this van has a rack", not a column — lib/buzzer.ts's
         * rule. So Standard shows On when every van has buzzers, Off when none does, per-van when
         * they differ. */
        buzzer_prompt: { value: rack.value === true, perVan: !rack.same },
        /* ── 🔴 PER VAN NOW (5 October 2026) ────────────────────────────────────────────────────
         * It was `{ value: truck.takes_cash, perVan: false }` — one truck value, declared never to
         * vary — which is precisely why turning it on for Van 1 turned it on for Van 2. With
         * `truck_vans.takes_cash` it varies like every other van setting, and `perVan` is computed
         * from the vans rather than asserted. */
        takes_cash: (() => {
          const vals = vanRows.map(v => resolveVanTakesCash(vanCash.byVanId.get(v.id) ?? null, truck.takes_cash ?? null))
          return {
            value: vals.length ? vals[0] : (truck.takes_cash ?? false),
            perVan: vals.length > 1 && !vals.every(x => x === vals[0]),
          }
        })(),
        order_ready: { value: ready.value === true, perVan: !ready.same },
        offline_protection: {
          enabled: offSwitch.value === true,
          mode: offMode.value ?? 'pause',
          perVan: !offSwitch.same || !offMode.same,
        },
        collection_interval_mins: { value: grid.value ?? 5, perVan: !grid.same },
      },
    })
  }

  // ── CREATE ──────────────────────────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const name = cleanName(body.name)
    if (!name) return NextResponse.json({ error: 'Give the type a name.' }, { status: 400 })

    /* ⚠️ THE NEXT SORT VALUE IS READ, NOT COUNTED. A truck who deleted their second of three types has
     * sort values 0 and 2; counting rows would hand the new type 2 as well and the order would depend
     * on which row the database returned first. */
    const { data: last } = await supabase
      .from('event_types').select('sort_order').eq('truck_id', truck.id)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sort_order = ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1

    /* 🔴 A NEW TYPE IS A COPY OF STANDARD — every value null, i.e. "same as Standard" — unless the
     * caller sent a suggestion's values. So creating one changes nothing until it is edited, which is
     * what the "+ New event type" panel promises. */
    /* ══ 🔴 A NEW TYPE IS A COPY OF VAN 1, NOT A BLANK (5 October 2026) ══════════════════════════
     * It was `blankTypeValues()` — every column NULL, "same as Standard" — and the grid drew each NULL
     * cell FADED at the first van's value. That is the second half of the localhost report: Market
     * "changed" when Van 1's cash changed, because Market was showing Van 1's value, not its own.
     *
     * 🔴 WITH A REAL VALUE IN EVERY COLUMN THERE IS NOTHING TO INHERIT, so no Standard edit can reach
     * a type. That is the fix, and it is a fix by construction rather than by a rule on the screen.
     * ⚠️ IT IS STILL "exactly like Standard" ON THE DAY IT IS MADE, which is what the + New event type
     * panel promises — it is a COPY of Standard, not an inheritance of it. The promise is unchanged;
     * only its mechanism is.
     * ⚠️ AN EXPLICIT `body.values` STILL WINS, so a caller that means to send values can. */
    const seed = await vanOneServiceValues(truck.id, truck.takes_cash ?? null)
    const values: Record<string, unknown> = {}
    for (const k of SERVICE_KEYS) {
      values[k] = body.values && typeof body.values === 'object'
        ? cleanValue(k, (body.values as Record<string, unknown>)[k])
        : cleanValue(k, seed[k])
    }

    const { data, error } = await supabase
      .from('event_types')
      .insert({ truck_id: truck.id, name, sort_order, ...values })
      .select('id')
      .single()
    if (error) {
      /* 23505 is the (truck_id, lower(name)) unique index. It is the one error an operator can cause
       * by hand, so it gets a sentence rather than a code. */
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: `You already have a type called “${name}”.` }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, id: (data as { id: string }).id })
  }

  // ── UPDATE one setting, or the name ─────────────────────────────────────────────────────────────
  if (action === 'update') {
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    /* ⚠️ AN ALLOWLIST, AND NOTHING SPREADS `body`. A client PATCHing `truck_id` or `id` is dropped
     * rather than honoured — the same discipline `sg_upsert_place` and `update_settings` follow. */
    const patch: Record<string, unknown> = {}
    if ('name' in body) {
      const name = cleanName(body.name)
      if (!name) return NextResponse.json({ error: 'Give the type a name.' }, { status: 400 })
      patch.name = name
    }
    for (const k of SERVICE_KEYS) {
      /* 🔴 `in` AND NOT A TRUTHINESS TEST. `null` is a real value here ("same as Standard") and so is
       * `false`; only an ABSENT key means "leave this setting alone". */
      if (k in body) patch[k] = cleanValue(k, body[k])
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })
    patch.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('event_types').update(patch).eq('id', id).eq('truck_id', truck.id)
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: `You already have a type called “${patch.name}”.` }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── MATCH STANDARD: copy VAN 1'S CURRENT VALUES into this type ─────────────────────────────────
  /* ══ 🔴 IT COPIES NOW; IT USED TO CLEAR (5 October 2026) ══════════════════════════════════════
   * "Match Standard" sent `blankTypeValues()` — every column NULL — which, under the OLD design,
   * meant "follow Standard from now on". With a type holding its own values there is no "follow", so
   * the same words have to do the same thing by a different mechanism: COPY what Standard is right
   * now. The operator's intent ("make this type the same as my usual setup") is identical; what
   * changes is that the copy is a snapshot rather than a subscription — and that is the whole point,
   * because a subscription is what made Market move when Van 1 moved.
   *
   * 🔴 THE SERVER COMPUTES THE COPY, from `vanOneServiceValues`, so the values the ⋯ menu promises
   * are the values that land. A client-sent payload would be a second definition of "Standard".
   * ⚠️ IT DOES NOT TOUCH PRICES. `price_change_on` and the rule are not service columns and are not in
   * `SERVICE_KEYS`; a type's prices are turned off by its own switch, which is where the operator is
   * looking when they want that. The confirm says so.
   */
  if (action === 'match_standard') {
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const seed = await vanOneServiceValues(truck.id, truck.takes_cash ?? null)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of SERVICE_KEYS) patch[k] = cleanValue(k, seed[k])
    const { error } = await supabase
      .from('event_types').update(patch).eq('id', id).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ── REORDER ─────────────────────────────────────────────────────────────────────────────────────
  if (action === 'reorder') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
    /* ⚠️ ONE UPDATE PER ROW, EACH SCOPED BY truck_id. An upsert of the whole list would need every
     * column (name is NOT NULL) and would let a caller rewrite a name through the reorder path. */
    for (let i = 0; i < ids.length; i++) {
      await supabase.from('event_types')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', ids[i]).eq('truck_id', truck.id)
    }
    return NextResponse.json({ ok: true })
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    /* 🔴 ITS EVENTS BECOME STANDARD, AND THE DATABASE DOES IT. `event_type_id` is
     * `on delete set null`, so no bulk update runs here and no event is lost — which is exactly what
     * the delete confirm on the panel says happens.
     * ⚠️ NOTHING IS WRITTEN BACK ONTO THOSE EVENTS. Their service settings return to the van and truck
     * defaults, and any hand change the truck made on one of them is still there, because a hand
     * change was never a type value. */
    const { error } = await supabase.from('event_types').delete().eq('id', id).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ── ASSIGN a type to one event, from the dashboard or the Add event modal ───────────────────────
  if (action === 'assign') {
    const eventId = String(body.eventId ?? '')
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    const rawType = body.typeId === null || body.typeId === '' ? null : String(body.typeId ?? '')

    /* The event must be this truck's. ⚠️ Checked by a read rather than trusted, because `eventId`
     * arrives from a client. */
    const { data: ev } = await supabase
      .from('truck_events').select('id').eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    let typeId: string | null = null
    if (rawType) {
      const { data: t } = await supabase
        .from('event_types').select('id').eq('id', rawType).eq('truck_id', truck.id).maybeSingle()
      if (!t) return NextResponse.json({ error: 'Event type not found' }, { status: 404 })
      typeId = String((t as { id: string }).id)
    }

    /* 🔴 ONE COLUMN WRITE. That is the whole of switching an event's type, including on a LIVE event:
     * nothing was copied onto the event, so there is nothing to re-apply and nothing to unwind, and
     * every hand change the truck made on this event is still there and still wins. */
    const patch: Record<string, unknown> = { event_type_id: typeId, updated_at: new Date().toISOString() }

    /* ── "CLEAR MY CHANGES AND USE <TYPE> EXACTLY" (decision 2) ──────────────────────────────────
     * 🔴 IT CLEARS EXACTLY THE COLUMNS A TYPE CAN SET, derived from SERVICE_KEYS so it cannot fall out
     * of step when stage 3 adds a setting. Every other per-event setting — the pause, the extra wait,
     * the paid step, the offline rules, the completion presses — is left exactly as the truck left it,
     * because a type does not set them and clearing them would be destroying work for no reason.
     * ⚠️ `order_ready_source` IS CLEARED ALONGSIDE `order_ready_override`, or the row would say "the
     * truck chose this" about a value that is now NULL. */
    if (body.clearOwn === true) {
      for (const k of SERVICE_KEYS) for (const col of EVENT_OVERRIDE_COLUMNS[k]) patch[col] = null
      patch.order_ready_source = null
      /* 🔴 AND THE EVENT'S OWN PRICES, BECAUSE THEY ARE A HAND CHANGE ON THIS EVENT TOO (§70).
       * "Clear my changes and use <type> exactly" has to mean it: an event left with `price_own` true
       * would keep charging its own prices while the dashboard said every setting came from the type.
       * The tag, the count, this clear and the card's Reset all cover the same set — that is the rule
       * the service rows already follow.
       * ⚠️ THE COLUMNS AND THE ROWS, BOTH. Leaving the rows behind would resurrect every typed price
       * the moment the operator chose "Own prices" again. */
      patch.price_own = false
      patch.price_mode = null
      patch.price_amount = null
      patch.price_rounding = null
      await deleteEventItemPrices(eventId)
    }

    const { error } = await supabase
      .from('truck_events').update(patch).eq('id', eventId).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, typeId })
  }

  // ── THE USUAL TYPE FOR A PLACE (decision 5) ────────────────────────────────────────────────────
  if (action === 'usual_for_venue') {
    /* 🔴 WORKED OUT WHEN NEEDED, FROM THE TRUCK'S OWN HISTORY — no defaults table to keep in step and
     * nothing to migrate when a venue is renamed. `normalisePlaceName` is the ONE matching function
     * `truck_places.name_key` is defined as, so this screen and the places list agree about what "the
     * same place" means. */
    /* ══ 🔴 BY PLACE FIRST (October 2026, the branches combined) ═════════════════════════════
     * When the form has a place picked, "the same place" is `placeForEvent` — the resolver the Places
     * list itself uses, which follows `merged_into_id`, so a pitch an operator merged counts as one
     * pitch here too. `normalizeVenue` is still passed and is still the ONE function
     * `truck_places.name_key` is defined as: it matches the events that have no place, which is most
     * of them. THE ACTION NAME IS UNCHANGED, so no caller had to be migrated.
     * ⚠️ `placeForEvent` IS PASSED IN rather than imported inside lib/event-types/read.ts, so the
     * event-types module still imports nothing from schedule-graphics — the arrangement
     * docs/event-types-investigation-report.md §8.2 asked for, intact across the merge. */
    const placeId = typeof body.placeId === 'string' ? body.placeId : null

    /* ══ 🔴 THE PIN COMES FIRST: `pin ?? the existing rule` (20261015) ═══════════════════════════════
     * `truck_places.usual_event_type_id` is the operator saying "always this type here". NULL is
     * "Automatic", which is the rule below — the newest event at this place supplies the type.
     *
     * ⛔ THE ORDER IS THE WHOLE POINT. The other way round, the pin would be unreachable for any place
     * that has ever had an event — which is every place a truck actually trades at — and the control
     * would silently do nothing. `scripts/places-tab.cjs` asserts this order, and it caught exactly
     * that: the column and the control were built before this read was wired, so the pin saved and
     * then changed nothing.
     *
     * ⚠️ A SEPARATE PROBED READ, FAILING OPEN TO THE RULE. 20261015 may not be applied; naming the
     * column alongside the history read would fail the whole thing and leave Add event with no
     * pre-selection at all. Open here means "Automatic", which is the pre-build behaviour.
     * ⚠️ AND THE PINNED TYPE IS RE-VALIDATED AGAINST THIS TRUCK. The FK cannot be composite (see
     * 20261015's note), so a row carrying another truck's id — however it got there — resolves to the
     * rule rather than naming a type this truck does not own. */
    /* ══ 🔴 AND "PINNED TO STANDARD" IS ITS OWN STATE, ABOVE THE ID (20261016) ═══════════════════
     * The full order is:
     *     usual_type_is_standard ? Standard : (usual_event_type_id ?? the automatic rule)
     * 🔴 WHY THE BOOLEAN EXISTS AT ALL: Standard has no `event_types` row — Standard IS the truck's
     * own settings (§70.2) — so "always Standard here" could not be stored in a nullable uuid whose
     * NULL already means Automatic. Saving Standard wrote NULL and the control read it back as
     * Automatic: the operator pinned Standard and watched it snap to something else.
     * ⛔ THE BOOLEAN WINS, and the WRITE path is what stops the two columns disagreeing — Standard
     * sets the boolean and clears the id, a type sets the id and clears the boolean, Automatic clears
     * both (`sg_place_usual_type`). This order is the belt to that braces: if a row ever carries both,
     * the answer is Standard rather than whichever column happened to be read first.
     * ⚠️ `typeId: null` IS STANDARD, and `by: 'pin'` IS WHAT MAKES IT DIFFERENT FROM "no answer". The
     * form shows the Standard pill as chosen rather than as a default nobody picked.
     *
     * ⚠️ ONE PROBED READ FOR BOTH COLUMNS. 20261016 may not be applied, and naming only the older
     * column would mean two reads for one question; naming both and failing open to the rule costs
     * one round trip and degrades to exactly the pre-20261015 behaviour. */
    if (placeId) {
      const { data: pinned, error: pinErr } = await supabase
        .from('truck_places')
        .select('usual_event_type_id, usual_type_is_standard')
        .eq('id', placeId).eq('truck_id', truck.id)
        .maybeSingle()
      /* ⚠️ A MISSING `usual_type_is_standard` (20261016 unapplied) FAILS THE WHOLE SELECT with 42703,
       * so the pin is re-read naming only the 20261015 column rather than lost. Without this a truck
       * on 20261015 would lose the pins it had already set the moment this code shipped. */
      let row = pinned as { usual_event_type_id: string | null; usual_type_is_standard?: boolean | null } | null
      if (pinErr && ['42703', 'PGRST204'].includes(pinErr.code || '')) {
        const { data: older } = await supabase
          .from('truck_places')
          .select('usual_event_type_id')
          .eq('id', placeId).eq('truck_id', truck.id)
          .maybeSingle()
        row = (older as { usual_event_type_id: string | null } | null) ?? null
      } else if (pinErr) {
        row = null
      }
      if (row?.usual_type_is_standard === true) {
        return NextResponse.json({ ok: true, typeId: null, by: 'pin' })
      }
      const pin = row?.usual_event_type_id ?? null
      if (pin) {
        const { data: t } = await supabase
          .from('event_types').select('id').eq('id', pin).eq('truck_id', truck.id).maybeSingle()
        const owned = (t as { id: string } | null)?.id ?? null
        if (owned) return NextResponse.json({ ok: true, typeId: owned, by: 'pin' })
      }
    }

    const { ok, typeId, by } = await usualTypeForPlace(
      supabase, truck.id,
      placeId,
      typeof body.venueName === 'string' ? body.venueName : null,
      normalizeVenue,
      placeForEvent,
    )
    return NextResponse.json({ ok, typeId, by })
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // PRICING ACTIONS (§70)
  // ════════════════════════════════════════════════════════════════════════════════════════════
  //
  // 🔴 ALL FIVE ARE BEHIND THE SAME PLAN GATE AS EVERY OTHER WRITE HERE. The gate is the single
  // `action !== 'load' && !canWrite` guard at the top of this handler, which refuses a NEW action by
  // DEFAULT — so these needed no new check and cannot have been accidentally left open. On a
  // downgrade: saved prices KEEP RESOLVING (the order paths do not consult this route) and these
  // actions 403, which is decision 8 — the screens go read-only exactly as they do for the service
  // settings.

  // ── A TYPE'S PRICE SETTINGS: the switch, the mode, the amount, the rounding ──────────────────
  if (action === 'set_type_pricing') {
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const patch = cleanPricingPatch(body)
    /* 🔴 THE SWITCH ONLY, OR THE RULE ONLY, OR BOTH — WHICHEVER THE BODY CARRIES. `in` and not a
     * truthiness test: `false` is the whole point of the switch.
     * ⚠️ SWITCHING OFF WRITES **NOTHING ELSE** (decision 1). The rule and the typed rows stay exactly
     * as they are, unused, so switching back on restores the setup. A `price_mode: null` here would
     * be the operator losing their work every time they charged menu prices for a weekend. */
    if ('price_change_on' in body) patch.price_change_on = body.price_change_on === true
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

    /* ══ 🔴 "SET EACH PRICE MYSELF" FREEZES WHAT WAS ALREADY BEING CHARGED ═══════════════════════
     *
     * **DOMINIC'S RULE:** *"when an event type is switched to 'Set each price myself', every item
     * keeps exactly the price it had just before the switch, under the old rule including its
     * rounding. A price only changes when the operator edits that item."*
     *
     * ⛔ **WITHOUT THIS, CLEARING THE ROUNDING WOULD MOVE EVERY PRICE.** `applyPriceRule` applies a
     * stored rounding whatever the mode, so a type on "+10%, nearest £1" switched to `'none'` went on
     * rounding every untyped item to the pound — with the control hidden on both screens, because
     * rounding is not one of `PRICE_MODES_WITH_AMOUNT`. Taking the rounding away on its own would
     * drop a £14.00 item to £12.50 on a settings save. See docs/phone-fixes-2-report.md §2.4.
     *
     * 🔴 **SO THE PRICES ARE WRITTEN DOWN FIRST, THEN THE RULE IS TAKEN AWAY — IN THAT ORDER, IN THIS
     * ONE SAVE.** `shouldLockIn` decides (and is unit-measured in scripts/event-pricing.cjs);
     * `lockedInPrices` computes each untyped item's price with the SAME `applyPriceRule` the customer's
     * menu and the order submit charge with, under the OLD mode, amount and rounding.
     * ⚠️ IT ALSO COVERS §2 OF THE BRIEF — a type ALREADY sitting in `'none'` with a stale rounding is
     * locked in the next time it is saved. No migration, no backfill, and nothing changes for a type
     * nobody saves. */
    const current = await readTypePricingForTruck(supabase, truck.id)
    const row = current.byTypeId.get(id)
    /* ⛔ A FAILED READ MUST NOT SILENTLY SKIP THE LOCK-IN. `ok: false` means the rows could not be
     * read, so whether this save would move a price is unknown — and writing the patch anyway is
     * exactly the silent price change this exists to prevent. */
    if (!current.ok || !row) {
      return NextResponse.json({ error: 'Could not read this type\u2019s prices; nothing was saved' }, { status: 400 })
    }
    const wasOn = row.price_change_on === true
    const lockIn = shouldLockIn({
      wasOn,
      willBeOn: 'price_change_on' in patch ? patch.price_change_on === true : wasOn,
      oldMode: row.price_mode,
      oldRounding: row.price_rounding,
      newMode: 'price_mode' in patch ? String(patch.price_mode) : row.price_mode,
    })
    if (lockIn) {
      const { ok, items } = await loadPricingItems(supabase, truck.id)
      if (!ok) {
        return NextResponse.json({ error: 'Could not read the menu; nothing was saved' }, { status: 400 })
      }
      const freeze = lockedInPrices(
        items,
        oldSetupOf(row.price_mode, row.price_amount, row.price_rounding),
        current.typedByTypeId.get(id) ?? {},
      )
      if (freeze.length) {
        /* ⚠️ `ignoreDuplicates` IS THE "items that already have a typed price keep it" RULE, enforced
         * by the database rather than only by the read above — two saves racing must not let one
         * overwrite the operator's own number with a recomputed one. ⛔ THE SAME NON-PARTIAL UNIQUE
         * `set_type_item_price` upserts on; see its note for why it cannot be a partial index. */
        const { error: freezeErr } = await supabase.from('event_item_prices').upsert(
          freeze.map(f => ({
            truck_id: truck.id, event_type_id: id, event_id: null, item_id: f.itemId,
            price: f.price, updated_at: new Date().toISOString(),
          })),
          { onConflict: 'event_type_id,item_id', ignoreDuplicates: true },
        )
        /* ⛔ AND IF THE FREEZE FAILS, THE SETTINGS ARE NOT SAVED. Writing the patch anyway would clear
         * the rounding with no prices written down — the one outcome worse than either half. */
        if (freezeErr) return NextResponse.json({ error: freezeErr.message }, { status: 400 })
      }
      /* 🔴 ONLY NOW IS THE RULE TAKEN AWAY. The amount is cleared and the rounding set to 'none', so
       * the stale rounding stops applying — which is safe precisely because every price it was
       * affecting has just been written down. ⚠️ THESE OVERRIDE WHATEVER THE BODY SENT: a client
       * cannot ask to keep a rounding that nothing on either screen can show. */
      patch.price_amount = null
      patch.price_rounding = 'none'
    }

    patch.updated_at = new Date().toISOString()

    const { error } = await supabase
      .from('event_types').update(patch).eq('id', id).eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, lockedIn: lockIn })
  }

  // ── A TYPE'S TYPED PRICE FOR ONE ITEM: set, or clear back to the rule ────────────────────────
  if (action === 'set_type_item_price') {
    const id = String(body.id ?? '')
    const itemId = String(body.itemId ?? '')
    if (!id || !itemId) return NextResponse.json({ error: 'id and itemId required' }, { status: 400 })

    /* ⚠️ BOTH IDS ARE VERIFIED AGAINST THIS TRUCK, not trusted. They arrive from a client, and
     * `event_item_prices` has no RLS policy that could tell one truck's type from another's — the
     * table is service-role only, so this handler IS the scope check. Writing a price onto another
     * truck's dish is the one thing this action must not be able to do. */
    const [{ data: t }, { data: item }] = await Promise.all([
      supabase.from('event_types').select('id').eq('id', id).eq('truck_id', truck.id).maybeSingle(),
      supabase.from('menu_items_db').select('id').eq('id', itemId).eq('truck_id', truck.id).maybeSingle(),
    ])
    if (!t) return NextResponse.json({ error: 'Event type not found' }, { status: 404 })
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const price = cleanTypedPrice(body.price)
    if (price === null) {
      /* 🔴 CLEARING IS A DELETE, NOT A £0. The ONLY way to say "use the rule for this item" is for the
       * row to be absent — a 0 would be a typed price of zero, which is a real and different
       * instruction ("free at festivals"). This is why the × on a typed price must delete. */
      const { error } = await supabase.from('event_item_prices')
        .delete().eq('event_type_id', id).eq('item_id', itemId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, cleared: true })
    }

    /* ══ 🔴 `onConflict` NAMES A **PLAIN** UNIQUE CONSTRAINT'S COLUMNS (20261013) ═══════════════════
     * `event_item_prices_type_item_key UNIQUE (event_type_id, item_id)`. This upsert is what makes
     * re-typing a price an UPDATE rather than a second row; `event_id` is left unset, which the
     * one-owner CHECK requires.
     *
     * ⛔ IT MUST NOT BE A PARTIAL INDEX, AND THIS LINE IS WHERE THAT WAS LEARNED THE HARD WAY.
     * 20261011 created the uniqueness as `… where event_type_id is not null`, and **PostgREST's
     * `on_conflict=` cannot target a partial index**: Postgres' conflict inference needs a
     * non-partial unique index or constraint on exactly those columns. So every save of a typed price
     * failed at PLANNING time with 42P10, "there is no unique or exclusion constraint matching the ON
     * CONFLICT specification", before anything was written.
     * ⚠️ AND THE PARTIAL PREDICATE WAS BUYING NOTHING. A type row ALWAYS has `event_type_id` set, so
     * plain uniqueness is fully enforced for it; an event row always has `event_id` set; and
     * `event_item_prices_one_owner` guarantees exactly one owner, so every row falls under one of the
     * two constraints. The "NULLs are distinct" worry only bites a row with BOTH owners null, which
     * the CHECK makes impossible.
     * 🔴 `scripts/event-pricing.cjs` NOW REFUSES ANY `onConflict:` IN app/ OR lib/ THAT A MIGRATION
     * DOES NOT BACK WITH A NON-PARTIAL UNIQUE — this class of fault is invisible to a stub client and
     * only ever appears against a real database. */
    const { error } = await supabase.from('event_item_prices').upsert({
      truck_id: truck.id, event_type_id: id, event_id: null, item_id: itemId,
      price, updated_at: new Date().toISOString(),
    }, { onConflict: 'event_type_id,item_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, price })
  }

  /* ══ ⛔ FOUR PRICING ACTIONS DELETED HERE (5 October 2026) ════════════════════════════════════════
   *     event_pricing_summary · load_event_pricing · save_event_pricing · clear_event_pricing
   *
   * They served the WHOLE-EVENT "own prices" rule — `truck_events.price_own` plus its own mode,
   * amount and rounding — and the "Prices for this event" sheet that edited it. Both are gone:
   * an event now carries only PER-ITEM prices, set from the dashboard's Menu & Stock Price column
   * through `set_event_item_price` above, and read through `event_item_prices`.
   *
   * 🔴 WHY THE WHOLE-EVENT RULE WENT. It was a second rule engine in a place nobody would look: an
   * event switched to "own prices" silently stopped following its type, so editing the Festival type
   * changed every festival EXCEPT the one somebody had nudged, with nothing on either screen to say
   * why. And it made "£1 more on one pizza tonight" an all-or-nothing act.
   *
   * ⚠️ THE FOUR `truck_events` COLUMNS ARE STILL THERE AND ARE READ BY NOTHING. Dropping them is a
   * migration this change does not need. `lib/event-pricing/price.ts` keeps the type that describes
   * them (`EventPricingColumns`) and deliberately accepts it in no pricing function, which is what
   * makes "unread" a property of the code rather than a promise.
   * ⚠️ AN EVENT LEFT WITH `price_own = true` therefore stops having a rule applied; any typed rows it
   * has keep working and now apply per item. docs/dashboard-cleanup-report.md carries the read-only
   * query that counts them.
   * ⛔ `assign` WITH `clearOwn` STILL CLEARS BOTH the columns and the rows, and that is unchanged —
   * "Clear my changes and use <type> exactly" has to mean it. */

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
