// lib/order-repricing.ts
// SERVER-AUTHORITATIVE order pricing under PRICE-LOCK.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────────
// Once an order is placed its prices are LOCKED. A later menu price change applies to FUTURE orders
// only. Editing an existing order must NEVER move the price of something already on it.
//
// So the authoritative price for an EXISTING line is the one already STORED on the order row —
// orders.items[].unit_price, orders.items[].modifiers[].price, orders.deals[].price,
// orders.deals[].slotModifiers[][].price — read server-side from the row we just selected.
//
// The live menu (menu_items_db / modifier_options / bundles_db) is consulted ONLY to price something
// genuinely NEW that this edit adds. It is the fallback, not the source.
//
// The request body's prices are ADVISORY throughout. They identify WHAT was selected; they never
// decide money. They are used as a price of last resort only for a NEW line whose name is not in the
// menu either — and that case is always surfaced to the operator (see UNRESOLVED).
//
// ── LINE IDENTITY ───────────────────────────────────────────────────────────────────────────────
// A submitted line is matched to a stored line by ITEM NAME + ITS MODIFIER NAME SET (lineIdentity).
// This is deliberately the same composition the three duplicated makeCartKey helpers use
// (app/dashboard/[token]/page.tsx:81, app/trucks/[slug]/order/page.tsx:126,
// components/dashboard/AddOrderPanel.tsx:47 — all byte-identical) with ONE difference: the free-text
// note is NOT part of the identity here. makeCartKey includes it because two notes make two basket
// lines; but a note has no effect on price, and folding it in would mean editing a customer's note
// silently re-priced their line off the live menu. Price identity is name + modifiers, nothing else.
//
// We do NOT trust the stored `cartKey` even when present. It is stored on operator-added and
// previously-edited orders but NOT on customer-placed or demo-seeded ones (see the report), so it is
// not a dependable key. Recomputing identity from name + modifier names works for every order.
//
// ── MONEY MATH IS NOT REIMPLEMENTED ─────────────────────────────────────────────────────────────
// Once each line has an authoritative price, the arithmetic (itemsTotal / dealsTotal / dealSavings /
// subtotal / discountAmt / total) is delegated verbatim to calculateOrderTotal in
// lib/order-calculations.ts — the single source of truth. This module RESOLVES prices;
// order-calculations COMBINES them. That is why subtotal here always includes deals
// (order-calculations.ts:108) with no separate formula to drift.
//
// DUPLICATE NAMES: two stored lines sharing one identity are matched pairwise, in order.
//
// ── MODIFIER OPTIONS ARE KEYED (ITEM NAME, OPTION NAME), NOT BY OPTION NAME ALONE ───────────────
// optionPrice used to be a flat truck-wide Record<optionName, price> and it MISPRICED. Live data on
// real-thai-food: "Prawn" is 1.50 on Springrolls and 0.00 on six other dishes; "Beef" is 0.50 on
// Massaman Curry and 0.00 elsewhere. A flat key keeps whichever row happened to load last, so the
// resolved price depended on row order — up to 1.50 out, silently, with nothing to catch it.
// The key is now (item name → option name), built from item_modifier_groups so it reflects what each
// dish ACTUALLY offers. A live sweep of every truck found ZERO items offering one option name twice,
// so (item, option) is a total key and no option ids are needed on the wire.
// A dish that does not offer an option resolves UNRESOLVED. There is deliberately NO flat fallback:
// falling back is exactly the behaviour that returned the wrong 1.50.
// EXCLUSIONS ARE HONOURED: item_modifier_groups.excluded_option_ids removes an option from THAT
// dish's book (model C, the same filter the menu API and the submit guard apply), so an excluded
// option is unresolved for that dish and priced normally everywhere else.
// (lib/option-stock.ts keeps its own flat by-name map for STOCK, which is a genuinely truck-wide
// pool — that is a different question from price and is untouched.)

import {
  calculateOrderTotal,
  type OrderCalculation,
  type DiscountCode,
  type MenuItem,
} from '@/lib/order-calculations'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Payload shapes (deliberately loose — these come off the wire / out of jsonb) ────────────────

export interface RepriceModifier { name: string; price?: number | string | null }

export interface RepriceItem {
  name: string
  quantity: number | string
  unit_price?: number | string | null
  modifiers?: RepriceModifier[] | null
  [k: string]: unknown
}

export interface RepriceDeal {
  name: string
  slots?: Record<string, string> | null
  slotModifiers?: Record<string, RepriceModifier[]> | null
  slotNotes?: Record<string, string> | null
  price?: number | string | null
  [k: string]: unknown
}

/** The order row as stored — the authoritative price source for everything already on the order. */
export interface StoredOrder {
  items?: unknown
  deals?: unknown
}

// ─── Results ────────────────────────────────────────────────────────────────────────────────────

// The OUTPUT shapes. Same fields as the input shapes, but every price is a resolved `number`.
export interface PricedModifier { name: string; price: number }

export interface PricedItem {
  name: string
  quantity: number
  unit_price: number
  modifiers?: PricedModifier[]
  [k: string]: unknown
}

export interface PricedDeal {
  name: string
  slots: Record<string, string>
  slotModifiers: Record<string, PricedModifier[]>
  slotNotes?: Record<string, string>
  price: number
  [k: string]: unknown
}

/**
 * A NEW line (or new modifier / new bundle) whose name is not on the current menu, so no
 * authoritative price exists for it anywhere. `advisoryPrice` is the client figure we fell back to.
 *
 * By construction this can NEVER describe a line that was already on the order: an existing line's
 * price comes from the stored row and never touches the menu.
 */
export interface UnresolvedRef {
  kind: 'item' | 'modifier' | 'deal' | 'discount'
  name: string
  /** For a modifier: the line (or deal slot) it was attached to. */
  on?: string
  advisoryPrice: number
}

export interface RepricedOrder {
  calculation: OrderCalculation
  /** The input items with unit_price (and each modifier price) REWRITTEN to the authoritative figure. */
  items: PricedItem[]
  /** The input deals with price (and each slot modifier price) REWRITTEN to the authoritative figure. */
  deals: PricedDeal[]
  unresolved: UnresolvedRef[]
}

export interface PriceBook {
  /** menu_items_db: name → price */
  itemPrice: Record<string, number>
  /**
   * modifier_options, keyed ITEM NAME → OPTION NAME → price_adjustment. Two levels, deliberately:
   * one option name can carry different prices on different dishes (see the header). An item with no
   * modifier groups has no entry at all; an option a dish excludes is absent from that dish's map.
   * A miss at EITHER level is UNRESOLVED — never a truck-wide fallback.
   */
  optionPrice: Record<string, Record<string, number>>
  /** bundles_db: name → bundle row */
  bundle: Record<string, { name: string; bundle_price: number; original_price: number | null }>
  /** menu_items_db as calculateOrderTotal's MenuItem[] — used for deal original-price/savings. */
  menuItems: MenuItem[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────────────────────────

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/**
 * The price identity of a line: item name + its modifier NAME set, order-independent.
 * Notes are excluded on purpose — see the header.
 */
export function lineIdentity(name: unknown, modifiers?: { name?: unknown }[] | null): string {
  const n = String(name ?? '')
  const mods = asArray<{ name?: unknown }>(modifiers)
    .map(m => String(m?.name ?? ''))
    .filter(Boolean)
    .sort()
    .join('|')
  return mods ? `${n}::${mods}` : n
}

// ─── The price book (FALLBACK source — new lines only) ──────────────────────────────────────────

/**
 * Read this truck's whole current menu price book in one round of queries. Used ONLY to price lines
 * the stored order does not already carry a price for.
 */
export async function loadPriceBook(supabase: SupabaseClient, truckId: string): Promise<PriceBook> {
  const [{ data: itemRows }, { data: optionRows }, { data: bundleRows }, { data: linkRows }] = await Promise.all([
    supabase.from('menu_items_db').select('name, price').eq('truck_id', truckId),
    // SAME truck-scoping join as lib/option-stock.ts fetchTruckOptionsByName — modifier_options has no
    // truck_id of its own, only group_id → modifier_groups.truck_id. `id` is selected because
    // excluded_option_ids is a list of OPTION IDS, so exclusions cannot be applied without it.
    supabase
      .from('modifier_options')
      .select('id, name, price_adjustment, group_id, modifier_groups!inner(truck_id)')
      .eq('modifier_groups.truck_id', truckId),
    supabase.from('bundles_db').select('name, bundle_price, original_price').eq('truck_id', truckId),
    // WHICH DISH OFFERS WHICH GROUP — the reason optionPrice can be item-scoped at all.
    // 🔴 TRUCK-SCOPED VIA THE EMBED, not read whole. item_modifier_groups has no truck_id of its own,
    // so the scope comes from menu_item_id → menu_items_db.truck_id, and the same embed hands back the
    // item NAME, which is the key we need. (app/api/orders/submit/route.ts:625 reads this table with no
    // truck filter at all — a full-table read. That is a separate backlog item; do not copy it here.)
    supabase
      .from('item_modifier_groups')
      .select('group_id, excluded_option_ids, menu_items_db!inner(name, truck_id)')
      .eq('menu_items_db.truck_id', truckId),
  ])

  const itemPrice: Record<string, number> = {}
  const menuItems: MenuItem[] = []
  for (const r of (itemRows as { name: string; price: unknown }[] | null) || []) {
    itemPrice[r.name] = num(r.price)
    menuItems.push({ name: r.name, price: num(r.price) })
  }

  // Options bucketed by their group, so a link row can expand to that group's options in one step.
  type OptionRow = { id: string; name: string; price_adjustment: unknown; group_id: string }
  const optionsByGroup = new Map<string, OptionRow[]>()
  for (const r of (optionRows as OptionRow[] | null) || []) {
    const bucket = optionsByGroup.get(r.group_id)
    if (bucket) bucket.push(r)
    else optionsByGroup.set(r.group_id, [r])
  }

  // ITEM NAME → OPTION NAME → price. Built from the links, so an option only appears against a dish
  // that genuinely offers it, and never against a dish that excludes it.
  const optionPrice: Record<string, Record<string, number>> = {}
  type LinkRow = { group_id: string; excluded_option_ids: string[] | null; menu_items_db: { name: string } | null }
  for (const link of (linkRows as unknown as LinkRow[] | null) || []) {
    const itemName = link?.menu_items_db?.name
    if (!itemName) continue
    const options = optionsByGroup.get(link.group_id)
    if (!options) continue
    const excluded = new Set(link.excluded_option_ids || [])
    const forItem = (optionPrice[itemName] ||= {})
    for (const o of options) {
      // Per-dish exclusion (model C) — an excluded option is NOT priceable on this dish, so it must
      // stay absent and fall through to unresolved rather than pick up the group's figure.
      if (excluded.has(o.id)) continue
      forItem[o.name] = num(o.price_adjustment)
    }
  }

  const bundle: PriceBook['bundle'] = {}
  for (const r of (bundleRows as { name: string; bundle_price: unknown; original_price: unknown }[] | null) || []) {
    bundle[r.name] = {
      name: r.name,
      bundle_price: num(r.bundle_price),
      original_price: r.original_price == null ? null : num(r.original_price),
    }
  }

  return { itemPrice, optionPrice, bundle, menuItems }
}

// ─── The stored order (PRIMARY source — everything already on the order) ────────────────────────

interface StoredLinePrice {
  unitPrice: number
  /** modifier name → the price it was locked in at */
  modPrice: Record<string, number>
}

interface StoredDealPrice {
  bundlePrice: number
  /** `${slotKey}::${modifierName}` → the price it was locked in at */
  modPrice: Record<string, number>
}

/**
 * Index the stored items by line identity. Values are QUEUES so two stored lines that share an
 * identity are consumed pairwise rather than both matching the same submitted line.
 *
 * A stored line with no usable unit_price (a legacy/malformed row) is skipped, so it falls through
 * to the menu rather than locking in a NaN.
 */
function indexStoredItems(items: unknown): Map<string, StoredLinePrice[]> {
  const index = new Map<string, StoredLinePrice[]>()
  for (const it of asArray<RepriceItem>(items)) {
    const unitPrice = num(it?.unit_price, NaN)
    if (!Number.isFinite(unitPrice)) continue
    const modPrice: Record<string, number> = {}
    for (const m of asArray<RepriceModifier>(it?.modifiers)) modPrice[String(m?.name ?? '')] = num(m?.price)
    const key = lineIdentity(it?.name, asArray<RepriceModifier>(it?.modifiers))
    const queue = index.get(key)
    if (queue) queue.push({ unitPrice, modPrice })
    else index.set(key, [{ unitPrice, modPrice }])
  }
  return index
}

/** Index the stored deals by BUNDLE NAME (a deal's price is per bundle, not per slot selection). */
function indexStoredDeals(deals: unknown): Map<string, StoredDealPrice[]> {
  const index = new Map<string, StoredDealPrice[]>()
  for (const d of asArray<RepriceDeal>(deals)) {
    const bundlePrice = num(d?.price, NaN)
    if (!Number.isFinite(bundlePrice)) continue
    const modPrice: Record<string, number> = {}
    const slotModifiers = (d?.slotModifiers || {}) as Record<string, RepriceModifier[]>
    for (const slotKey of Object.keys(slotModifiers)) {
      for (const m of asArray<RepriceModifier>(slotModifiers[slotKey])) {
        modPrice[`${slotKey}::${String(m?.name ?? '')}`] = num(m?.price)
      }
    }
    const key = String(d?.name ?? '')
    const queue = index.get(key)
    if (queue) queue.push({ bundlePrice, modPrice })
    else index.set(key, [{ bundlePrice, modPrice }])
  }
  return index
}

/** Take (and consume) the next stored match for a key, if any. */
function takeMatch<T>(index: Map<string, T[]>, key: string): T | undefined {
  const queue = index.get(key)
  if (!queue || queue.length === 0) return undefined
  return queue.shift()
}

// ─── Re-pricing ─────────────────────────────────────────────────────────────────────────────────

/**
 * Price an edited order under price-lock and compute its totals via calculateOrderTotal.
 *
 * @param items       submitted lines — names/modifiers/quantities are honoured, prices are advisory
 * @param deals       submitted deals — same
 * @param priceBook   the CURRENT menu, used only for lines the stored order does not cover
 * @param stored      the order row as it stands, the authoritative price source
 * @param discountCode the RESOLVED code row (or null). Resolution is the caller's job because the
 *                     fallback policy differs per path — see the edit handler.
 */
export function repriceOrder(
  items: RepriceItem[] | null | undefined,
  deals: RepriceDeal[] | null | undefined,
  priceBook: PriceBook,
  stored: StoredOrder,
  discountCode?: DiscountCode | null,
): RepricedOrder {
  const unresolved: UnresolvedRef[] = []
  const storedItems = indexStoredItems(stored?.items)
  const storedDeals = indexStoredDeals(stored?.deals)

  // Price a modifier that is NEW (no locked price): current menu, else the advisory figure + a flag.
  //
  // 🔴 `itemName` IS THE LOOKUP KEY. `on` is for the operator-facing message only and is NOT
  // interchangeable with it: for a deal slot `on` falls back to a synthesised "<deal> · <slot>" label
  // that is not any dish's name, and using it as a key would miss every time. They are passed
  // separately on purpose. A null itemName (no resolvable dish) is UNRESOLVED, not a truck-wide guess.
  const priceNewModifier = (m: RepriceModifier, on: string, itemName: string | null): number => {
    const advisory = num(m?.price)
    const known = itemName ? priceBook.optionPrice[itemName]?.[String(m?.name ?? '')] : undefined
    if (known === undefined) {
      unresolved.push({ kind: 'modifier', name: m?.name ?? '(unnamed)', on, advisoryPrice: advisory })
      return advisory
    }
    return known
  }

  // ── ITEMS ──────────────────────────────────────────────────────────────────────────────────
  const repricedItems: PricedItem[] = (items || []).map(it => {
    // Quantity stays client-supplied — it is WHAT was ordered, not money — but is clamped to >= 0 so
    // a negative can never subtract money from the bill. Quantity may change freely on a locked line.
    const quantity = Math.max(0, num(it?.quantity))
    const advisoryUnit = num(it?.unit_price)
    const mods = asArray<RepriceModifier>(it?.modifiers)
    const name = String(it?.name ?? '')
    const locked = takeMatch(storedItems, lineIdentity(name, mods))

    let serverUnit: number
    let repricedMods: PricedModifier[]

    if (locked) {
      // ── PRICE-LOCKED. This exact line (name + modifier set) is already on the order, so its price
      // is whatever it was placed at. The menu is not consulted at all — a price rise since placement
      // must not reach this customer. Per-modifier prices come from the stored line too, so the
      // stored row stays internally consistent (unit_price == base + sum of its modifier prices).
      serverUnit = locked.unitPrice
      repricedMods = mods.map(m => ({
        ...m,
        name: String(m?.name ?? ''),
        price: locked.modPrice[String(m?.name ?? '')] ?? num(m?.price),
      }))
    } else {
      // ── NEW LINE (added during this edit, or an existing item whose MODIFIER SET changed — see the
      // report for the reasoning on that second case). Nothing is locked, so price it at the CURRENT
      // menu: base + the surcharges of the modifiers now selected.
      const base = priceBook.itemPrice[name]
      if (base === undefined) {
        // Not on the menu either. Cannot verify any part of the line, so the advisory unit price
        // stands (it already includes whatever modifiers were applied) and the operator is told.
        unresolved.push({ kind: 'item', name: name || '(unnamed)', advisoryPrice: advisoryUnit })
        serverUnit = advisoryUnit
        repricedMods = mods.map(m => ({ ...m, name: String(m?.name ?? ''), price: num(m?.price) }))
      } else {
        // `name` is this line's dish and is known to be on the menu (base !== undefined above), so it
        // is a valid key into the item-scoped option book.
        repricedMods = mods.map(m => ({ ...m, name: String(m?.name ?? ''), price: priceNewModifier(m, name || '(unnamed)', name) }))
        // Repo-wide convention: unit_price INCLUDES the modifiers
        // (app/trucks/[slug]/order/page.tsx:1127, lib/seed-demo-orders.ts:290-292).
        serverUnit = base + repricedMods.reduce((s, m) => s + m.price, 0)
      }
    }

    return {
      ...it,
      name,
      quantity,
      unit_price: serverUnit,
      // Explicit `undefined` (not an omitted key) so the spread above can't leak the loose input type
      // back in. JSON.stringify drops it, so a line with no modifiers stores exactly as before.
      modifiers: mods.length ? repricedMods : undefined,
    }
  })

  // ── DEALS ──────────────────────────────────────────────────────────────────────────────────
  // Same rule, applied per component: a stored deal keeps its stored bundle price, and each slot
  // modifier that was already on it keeps its stored surcharge. A slot modifier added during this
  // edit is priced at the current menu. A newly added deal takes the current bundles_db price.
  const dealCalcInput: { bundle: { name: string; bundle_price: number; original_price?: number | null }; slots: Record<string, string>; modifierExtra: number }[] = []
  const repricedDeals: PricedDeal[] = (deals || []).map(d => {
    const name = String(d?.name ?? '')
    const slotModifiers = (d?.slotModifiers || {}) as Record<string, RepriceModifier[]>
    const slots = (d?.slots || {}) as Record<string, string>
    const locked = takeMatch(storedDeals, name)

    const repricedSlotModifiers: Record<string, PricedModifier[]> = {}
    let modifierExtra = 0
    for (const slotKey of Object.keys(slotModifiers)) {
      const list = asArray<RepriceModifier>(slotModifiers[slotKey])
      // The DISH filling this slot — the lookup key. Null when the slot names no item, which is
      // UNRESOLVED: there is no dish to price the option against and no truck-wide book to guess from.
      const slotItemName = String(slots[slotKey] ?? '') || null
      // The operator-facing label. Falls back to a synthesised name when the slot is empty, which is
      // precisely why it must not double as the key.
      const on = slotItemName || `${name || 'deal'} · ${slotKey}`
      repricedSlotModifiers[slotKey] = list.map(m => {
        const modName = String(m?.name ?? '')
        const lockedPrice = locked?.modPrice[`${slotKey}::${modName}`]
        return { ...m, name: modName, price: lockedPrice !== undefined ? lockedPrice : priceNewModifier(m, on, slotItemName) }
      })
      modifierExtra += repricedSlotModifiers[slotKey].reduce((s, m) => s + m.price, 0)
    }

    let bundlePrice: number
    if (locked) {
      bundlePrice = locked.bundlePrice
    } else {
      const known = priceBook.bundle[name]
      if (!known) {
        const advisory = num(d?.price)
        unresolved.push({ kind: 'deal', name: name || '(unnamed)', advisoryPrice: advisory })
        bundlePrice = advisory
      } else {
        bundlePrice = known.bundle_price
      }
    }

    dealCalcInput.push({
      bundle: {
        name,
        bundle_price: bundlePrice,
        // original_price feeds the dealSavings display figure only, never the charge, so reading it
        // live is harmless (and there is nowhere else to read it from — it is not stored on the row).
        original_price: priceBook.bundle[name]?.original_price ?? null,
      },
      slots,
      modifierExtra,
    })

    return {
      ...d,
      name,
      slots,
      slotModifiers: repricedSlotModifiers,
      slotNotes: (d?.slotNotes ?? undefined) as Record<string, string> | undefined,
      price: bundlePrice,
    }
  })

  // ── TOTALS — delegated, not reimplemented ──────────────────────────────────────────────────
  const calculation = calculateOrderTotal(
    repricedItems.map(i => ({ name: String(i.name), price: num(i.unit_price), quantity: num(i.quantity) })),
    dealCalcInput,
    priceBook.menuItems,
    discountCode ?? null,
  )

  return { calculation, items: repricedItems, deals: repricedDeals, unresolved }
}

/** pence, exact. The authoritative charge amount for orders.total_minor. */
export function toMinor(amount: number): number {
  return Math.round(num(amount) * 100)
}

/** pence → pounds. The INVERSE of toMinor, and the only way back: the payment ledger holds integer minor
 *  units while orders.amount_paid is numeric(8,2) pounds, so every crossing of that boundary goes through
 *  this pair. NEVER hardcode ×100 or ÷100 at a call site — one open-coded conversion is all it takes for a
 *  money value to be out by two orders of magnitude with nothing to catch it. */
export function fromMinor(minor: number): number {
  return Math.round(num(minor)) / 100
}
