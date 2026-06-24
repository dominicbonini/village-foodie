// lib/option-stock.ts
// Stage D2 — runtime shared-pool stock for modifier options. A STANDING counter
// (modifier_options.stock_count; NULL = untracked/unlimited) drawn down by orders across ALL
// dishes that use the option, and re-credited on un-placement.
//
// SEPARATE AXIS from kitchen capacity (Section 31): this NEVER touches production_slot_usage /
// the capacity engine / the booking fit. Concurrency is via the atomic conditional RPC
// (decrement_modifier_option_stock) — oversell-safe independent of the per-event booking lock,
// which cannot serialise a shared pool that spans events.
//
// MATCHING KEY: order-line modifiers are the {name,price} basket shape (no option id). Options
// are resolved by NAME, scoped to the truck (via the group→truck join), among TRACKED options
// (stock_count not null). Within a truck, tracked option names are assumed distinct (dup name
// across two tracked options is the documented edge — last-wins on draw, both-credited on
// release; the fix path is threading option id onto the line, deferred).

import type { SupabaseClient } from '@supabase/supabase-js'

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

/**
 * Draw the shared pool for every TRACKED selected option. Atomic per option (the conditional RPC).
 * ALL-OR-NOTHING: if any option is insufficient, the already-drawn ones are RE-INCREMENTED and
 * { ok:false } is returned (no partial draw left behind). Untracked options are skipped (no gate).
 * Returns the `drawn` list so the caller can compensate if the order ultimately fails to place.
 * FAIL-OPEN on an internal error (log + proceed without drawing) — never block an order on a blip;
 * the conditional RPC remains the real oversell guard whenever it can run.
 */
export async function drawOptionStock(
  supabase: SupabaseClient, truckId: string, items: any[], deals: any[],
): Promise<{ ok: boolean; soldOutName?: string; drawn: { id: string; qty: number }[] }> {
  try {
    const qtys = tallyOptionQtys(items, deals)
    const names = Object.keys(qtys)
    if (names.length === 0) return { ok: true, drawn: [] }
    const opts = await fetchTruckOptionsByName(supabase, truckId, names)
    const idByName: Record<string, string> = {}
    opts.forEach(o => { if (o.stock_count != null) idByName[o.name] = o.id }) // tracked only
    const drawn: { id: string; qty: number }[] = []
    for (const name of names) {
      const id = idByName[name]
      if (!id) continue // untracked → not gated
      const { data: ok } = await supabase.rpc('decrement_modifier_option_stock', { p_id: id, p_qty: qtys[name] })
      if (ok === true) {
        drawn.push({ id, qty: qtys[name] })
      } else {
        // Insufficient → roll back this attempt's draws, reject.
        for (const d of drawn) await supabase.rpc('increment_modifier_option_stock', { p_id: d.id, p_qty: d.qty })
        return { ok: false, soldOutName: name, drawn: [] }
      }
    }
    return { ok: true, drawn }
  } catch (err) {
    console.error('[option-stock] draw error — proceeding (fail-open):', err)
    return { ok: true, drawn: [] }
  }
}

/**
 * Resolve (READ-ONLY, no decrement) the tracked-option draw list [{id, qty}] for an order's selected
 * options — the RESOLUTION half of drawOptionStock. Under §45 the atomic decrement moves INSIDE
 * place_order_atomic (so a rollback auto-restores the pool), and this only maps name→id+qty: same
 * tally, same fetch, same last-wins-per-name as drawOptionStock, untracked (stock_count null) skipped.
 * FAIL-OPEN on error (returns []) — never block an order on a resolution blip; the RPC's conditional
 * decrement remains the real oversell guard.
 */
export async function resolveOptionDraws(
  supabase: SupabaseClient, truckId: string, items: any[], deals: any[],
): Promise<{ id: string; qty: number }[]> {
  try {
    const qtys = tallyOptionQtys(items, deals)
    const names = Object.keys(qtys)
    if (names.length === 0) return []
    const opts = await fetchTruckOptionsByName(supabase, truckId, names)
    const idByName: Record<string, string> = {}
    opts.forEach(o => { if (o.stock_count != null) idByName[o.name] = o.id }) // tracked only, last-wins
    const draws: { id: string; qty: number }[] = []
    for (const name of names) {
      const id = idByName[name]
      if (id) draws.push({ id, qty: qtys[name] })
    }
    return draws
  } catch (err) {
    console.error('[option-stock] resolve error — proceeding (fail-open):', err)
    return []
  }
}

/** Re-increment specific draws (compensation for an order that drew but did not ultimately place). */
export async function compensateOptionDraws(
  supabase: SupabaseClient, drawn: { id: string; qty: number }[],
): Promise<void> {
  for (const d of drawn) {
    try { await supabase.rpc('increment_modifier_option_stock', { p_id: d.id, p_qty: d.qty }) }
    catch (err) { console.error('[option-stock] compensate error:', err) }
  }
}

/**
 * Reversal on un-placement (cancel / reject / edit-remove): re-credit each tracked option the order
 * consumed, resolved by name at reversal time. Caller MUST guard against double-reversal (only call
 * for an order transitioning OUT of a stock-drawing status). Untracked options are skipped (RPC also
 * guards). Plain add, no clamp (documented edge).
 */
export async function releaseOptionStock(
  supabase: SupabaseClient, truckId: string, items: any[], deals: any[],
): Promise<void> {
  try {
    const qtys = tallyOptionQtys(items, deals)
    const names = Object.keys(qtys)
    if (names.length === 0) return
    const opts = await fetchTruckOptionsByName(supabase, truckId, names)
    for (const o of opts) {
      if (o.stock_count == null) continue // untracked → nothing to credit
      await supabase.rpc('increment_modifier_option_stock', { p_id: o.id, p_qty: qtys[o.name] || 0 })
    }
  } catch (err) {
    console.error('[option-stock] release error:', err)
  }
}

/**
 * Backstop: returns the name of the first selected option that is SOLD OUT — manual (available=false)
 * OR out of stock (stock_count===0) — else null. Catches MANUAL sold-out, which the stock decrement
 * (which only checks the count) does not. FAIL-OPEN: on error returns null (don't block valid orders).
 */
export async function findSoldOutOption(
  supabase: SupabaseClient, truckId: string, items: any[], deals: any[],
): Promise<string | null> {
  try {
    const qtys = tallyOptionQtys(items, deals)
    const names = Object.keys(qtys)
    if (names.length === 0) return null
    const opts = await fetchTruckOptionsByName(supabase, truckId, names)
    const bad = opts.find(o => o.available === false || o.stock_count === 0)
    return bad ? bad.name : null
  } catch (err) {
    console.error('[option-stock] sold-out check error — proceeding (fail-open):', err)
    return null
  }
}
