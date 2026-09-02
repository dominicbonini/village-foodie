// lib/option-stock.ts
// Modifier-option (extras) stock — the CEILING model (converted from the old decrement pool, step 3).
// modifier_options.stock_count is now a TEMPLATE ceiling; event_option_stock.stock_count is the per-event
// ceiling override (NULL = inherit); NULL = unlimited. The gate is checkOptionCeilingShortfall — the
// effective ceiling vs the LIVE option tally for the event (getLiveOptionCounts), run through the SHARED
// checkCeilingShortfall engine (lib/stock-guard) so items + options use ONE model and can't drift.
// Nothing is decremented at placement, so cancel/reject/edit need no reversal (removing the order from
// the live set IS the credit-back). available=false stays a hard sold-out (findSoldOutOption).
//
// SEPARATE AXIS from kitchen capacity (Section 31): this NEVER touches production_slot_usage / the
// capacity engine / the booking fit. Options are resolved by NAME, scoped to the truck (group→truck
// join). Within a truck, tracked option names are assumed distinct (dup name = documented edge,
// last-wins; the fix path is threading option id onto the line, deferred).

import type { SupabaseClient } from '@supabase/supabase-js'
import { checkCeilingShortfall } from '@/lib/stock-guard'

interface OrderLineLike { quantity?: number; modifiers?: { name: string }[] }
interface DealLike { slotModifiers?: Record<string, { name: string }[]> }

/** name → total option quantity across all lines (dish qty × the option) + deal-slot modifiers. */
function tallyOptionQtys(items: OrderLineLike[] | null | undefined, deals: DealLike[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const it of (items || [])) {
    const q = Number(it.quantity) || 1
    for (const m of (it.modifiers || [])) out[m.name] = (out[m.name] || 0) + q
  }
  for (const d of (deals || [])) {
    const sm = d.slotModifiers || {}
    for (const cat of Object.keys(sm)) for (const m of (sm[cat] || [])) out[m.name] = (out[m.name] || 0) + 1
  }
  return out
}

/** The truck's options matching these names (scoped via group→truck), with stock + availability. */
async function fetchTruckOptionsByName(
  supabase: SupabaseClient, truckId: string, names: string[],
): Promise<{ id: string; name: string; stock_count: number | null; available: boolean | null }[]> {
  if (names.length === 0) return []
  const { data } = await supabase
    .from('modifier_options')
    .select('id, name, stock_count, available, modifier_groups!inner(truck_id)')
    .eq('modifier_groups.truck_id', truckId)
    .in('name', names)
  return (data as any[] | null) || []
}

// NOTE (extras stock conversion, step 3): the DECREMENT-POOL machinery — drawOptionStock,
// resolveOptionDraws, compensateOptionDraws, releaseOptionStock — was REMOVED. Options are now gated by
// the CEILING model below (checkOptionCeilingShortfall, computed live from active orders), matching menu
// items, so there is nothing to draw/release/compensate. The ± SQL helpers (decrement_/increment_
// modifier_option_stock) and the place_order_atomic option-draw are dropped in the same migration.

// ══════════════════════════════════════════════════════════════
// CEILING MODEL (extras stock conversion, step 2) — runs ALONGSIDE the decrement pool above (additive;
// the pool/draw is removed in step 3). Mirrors the menu-item ceiling model EXACTLY: the per-event
// effective option ceiling (event_option_stock ?? modifier_options template) is checked against the LIVE
// option tally for the event, via the SHARED checkCeilingShortfall engine (lib/stock-guard) — one model,
// so items + options can't drift. NULL ceiling = unlimited. `available=false` stays the hard sold-out
// (findSoldOutOption, untouched). Pre-lock, BEFORE insert, like the item check.
// ══════════════════════════════════════════════════════════════

/** Live option "sold" tally for an event — mirrors getLiveItemCounts (lib/stock-availability.ts): same
 *  orders query, same live status set (NOT cancelled/rejected → pending/confirmed/modified). Tallies
 *  option NAMES across all orders via the existing tallyOptionQtys (items[].modifiers + deals[].slotModifiers). */
export async function getLiveOptionCounts(
  supabase: SupabaseClient, truckId: string, eventId: string,
): Promise<Record<string, number>> {
  const { data: orders } = await supabase
    .from('orders')
    .select('items, deals')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .neq('status', 'rejected')
  const counts: Record<string, number> = {}
  for (const o of (orders as any[] | null) || []) {
    const t = tallyOptionQtys(o.items, o.deals)
    for (const [name, q] of Object.entries(t)) counts[name] = (counts[name] || 0) + q
  }
  return counts
}

/** Effective option-ceiling resolver: event_option_stock(this event).stock_count ?? modifier_options
 *  .stock_count (NULL = unlimited). By NAME (last-wins on dup, consistent with the tally/draw model);
 *  an unknown/untracked name → null (unlimited). Mirrors the menu-item itemCeiling resolver. */
async function buildOptionCeiling(
  supabase: SupabaseClient, truckId: string, names: string[], eventId?: string | null,
): Promise<(name: string) => number | null> {
  const opts = await fetchTruckOptionsByName(supabase, truckId, names)
  const overrideById: Record<string, number | null> = {}
  if (eventId && opts.length) {
    const { data: ov, error: ovErr } = await supabase
      .from('event_option_stock')
      .select('option_id, stock_count')
      .eq('truck_id', truckId)
      .eq('event_id', eventId)
      .in('option_id', opts.map(o => o.id))
    // 🔴 BOUND AND REPORTED. Discarded, a failure produced an empty override map, so the ceiling
    // resolved to the TEMPLATE and the per-event ceiling was not enforced — with nothing said anywhere.
    if (ovErr) console.error('[option-stock] buildOptionCeiling: event_option_stock read FAILED — ceiling falls back to the TEMPLATE:', ovErr.code, ovErr.message)
    ;(ov as any[] | null || []).forEach(r => { overrideById[r.option_id] = r.stock_count ?? null })
  }
  const byName: Record<string, number | null> = {}
  for (const o of opts) {
    const ov = overrideById[o.id]
    byName[o.name] = ov != null ? ov : (o.stock_count ?? null) // event override ?? template
  }
  return (name: string) => (name in byName ? byName[name] : null)
}

/** Option CEILING shortfall — mirrors checkStockShortfall, through the SHARED checkCeilingShortfall
 *  engine (no secondary axis: options have no category). Returns [{name, remaining}] for options over
 *  their event ceiling, or null. MUST run under the per-event lock, BEFORE the order inserts (like the
 *  item check).
 *  FAIL-OPEN, and precisely: a DB read failure is bound at the call site and falls back to the TEMPLATE
 *  ceiling; a genuine JS throw is caught below and returns null. Neither blocks a valid order. */
export async function checkOptionCeilingShortfall(
  supabase: SupabaseClient, truckId: string, eventId: string, items: any[], deals: any[],
): Promise<{ name: string; remaining: number }[] | null> {
  try {
    const reqTally = tallyOptionQtys(items, deals)
    const names = Object.keys(reqTally)
    if (names.length === 0) return null
    const optionLines = names.map(name => ({ name, quantity: reqTally[name] }))
    const [liveTally, ceiling] = await Promise.all([
      getLiveOptionCounts(supabase, truckId, eventId),
      buildOptionCeiling(supabase, truckId, names, eventId),
    ])
    return checkCeilingShortfall(optionLines, liveTally, ceiling) // no secondary — option-only ceiling
  } catch (err) {
    // 🔴 THIS CATCH NEVER SAW A DATABASE ERROR, AND ITS OLD WORDING CLAIMED IT DID.
    // The Supabase client RETURNS `{ data, error }`; it does not throw. So every failed
    // event_option_stock read — 22P02 on every call since the table was created — flowed straight past
    // here while the log line advertised a fail-open that had not happened. A guard that reads as
    // protection and cannot fire for the class it names is worse than no guard (manual, §35).
    // 🟢 THE DB-ERROR CLASS IS NOW HANDLED AT THE CALL SITE (see buildOptionCeiling), where the error
    // is bound and logged. What remains here is the ONLY thing this catch ever actually caught: a
    // genuine JS throw from the tally/resolve helpers. That is still worth failing open on.
    console.error('[option-stock] ceiling check THREW (not a DB error — those are handled inline) — proceeding fail-open:', err)
    return null
  }
}

/**
 * Backstop: returns the name of the first selected option that is SOLD OUT — manual (available=false)
 * OR out of stock (stock_count===0) — else null. Catches MANUAL sold-out, which the stock decrement
 * (which only checks the count) does not.
 * FAIL-OPEN, and precisely: a DB read failure is bound inline and gates on the TEMPLATE only; a genuine
 * JS throw is caught below and returns null. Neither blocks a valid order.
 */
export async function findSoldOutOption(
  supabase: SupabaseClient, truckId: string, items: any[], deals: any[], eventId?: string | null,
): Promise<string | null> {
  try {
    const qtys = tallyOptionQtys(items, deals)
    const names = Object.keys(qtys)
    if (names.length === 0) return null
    const opts = await fetchTruckOptionsByName(supabase, truckId, names)
    // PER-EVENT override (extras stock-scoping fix, stage 1): event_option_stock(this event) ?? template.
    // So an extra marked sold-out / stock-0 FOR THIS EVENT on the dashboard blocks the order (the
    // customer read is now event-scoped too). NOTE: the order DECREMENT is still template (stage 2) —
    // this backstop only gates availability. Both override columns are NULL = inherit template.
    const overrideById: Record<string, { stock_count: number | null; available: boolean | null }> = {}
    if (eventId && opts.length) {
      const { data: ov, error: ovErr } = await supabase
        .from('event_option_stock')
        .select('option_id, stock_count, available')
        .eq('truck_id', truckId)
        .eq('event_id', eventId)
        .in('option_id', opts.map(o => o.id))
      // 🔴 BOUND AND REPORTED — same class as buildOptionCeiling above. On failure this backstop
      // gates on the TEMPLATE only, so a per-event sold-out extra would NOT block the order.
      if (ovErr) console.error('[option-stock] findSoldOutOption: event_option_stock read FAILED — gating on the TEMPLATE only:', ovErr.code, ovErr.message)
      ;(ov as any[] | null || []).forEach(r => { overrideById[r.option_id] = { stock_count: r.stock_count ?? null, available: r.available ?? null } })
    }
    const bad = opts.find(o => {
      const ev = overrideById[o.id]
      const effAvailable = (ev && ev.available != null) ? ev.available : (o.available !== false)
      const effStock = (ev && ev.stock_count != null) ? ev.stock_count : (o.stock_count ?? null)
      return effAvailable === false || effStock === 0
    })
    return bad ? bad.name : null
  } catch (err) {
    // Same correction as checkOptionCeilingShortfall above: this never caught a database error, because
    // the client returns them rather than throwing. DB errors are now bound and logged inline; this
    // catches a genuine JS throw only, and failing open on one is still right — a backstop must never
    // be the reason a valid order is refused.
    console.error('[option-stock] sold-out check THREW (not a DB error — those are handled inline) — proceeding fail-open:', err)
    return null
  }
}
