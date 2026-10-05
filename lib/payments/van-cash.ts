// lib/payments/van-cash.ts — reading `truck_vans.takes_cash`, safely.
//
// ── 🔴 WHY THIS IS ITS OWN PROBED READ AND NOT A COLUMN ON AN EXISTING SELECT ─────────────────────
// `truck_vans.takes_cash` is added by 20261012_van_cash_and_type_values.sql. Two selects already read
// `truck_vans` on paths that matter, and adding one column to either would be a mistake with a
// different shape in each:
//
//   • `app/api/dashboard/route.ts` reads `kitchen_capacity, capacity_window_mins, name,
//     auto_pause_on_offline, offline_protection_mode, offline_auto_reject_mins, show_cooking_step,
//     order_ready_enabled, buzzer_count` for the SELECTED EVENT'S VAN. Its own comment records what a
//     42703 there costs: the error IS caught, and the whole van degrades to "no capacity limit, no
//     cooking step and no order-ready step" — a plausible configuration rather than a visible fault,
//     which is the worst kind of failure. A pricing-era migration must not be able to turn the
//     mark-ready button off.
//   • `app/api/manage/route.ts`'s `get_vans` is what Settings draws every van from. The same 42703
//     there empties the van list.
//
// 🔴 SO IT IS A SEPARATE STATEMENT WITH ITS OWN BLAST RADIUS, AND ITS FAILURE IS "null" — which
// `resolveTakesCashWithType` reads as "use `trucks.takes_cash`", i.e. exactly what every truck does
// today. `lib/event-types/read.ts` and `lib/slot-interval.ts`'s `readEventIntervals` follow the same
// discipline for the same reason, and `scripts/slot-interval-van-list-tolerance.cjs` exists because
// this repository has been bitten by the mixed-select version of it.
//
// ⚠️ THE CODE MAY THEREFORE DEPLOY BEFORE THE MIGRATION. That is not permission to do so — Settings
// would show every van following the truck — it is insurance that the order cannot break a service.

import type { SupabaseClient } from '@supabase/supabase-js'

/** The codes that mean "the column is not there yet". Anything else is a real failure. */
const NOT_THERE = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

const why = (code: string | undefined): string =>
  code && NOT_THERE.has(code)
    ? `truck_vans.takes_cash is absent (${code}) — migration 20261012 has not been applied`
    : `read failed (${code ?? 'no code'})`

/**
 * One van's own cash setting.
 *
 * @returns `null` for "this van has no opinion" — which is every van before 20261012 is applied, and
 *          every van the operator has not touched since. The caller resolves it against
 *          `trucks.takes_cash`.
 */
export async function readVanTakesCash(
  supabase: SupabaseClient,
  vanId: string | null | undefined,
): Promise<boolean | null> {
  if (!vanId) return null
  try {
    const { data, error } = await supabase
      .from('truck_vans').select('takes_cash').eq('id', vanId).maybeSingle()
    if (error) {
      console.warn(`[van-cash] van ${vanId}: ${why((error as { code?: string }).code)}; the truck default`)
      return null
    }
    return (data as { takes_cash?: boolean | null } | null)?.takes_cash ?? null
  } catch (e) {
    console.warn('[van-cash] read threw; the truck default:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/**
 * Every van's cash setting for one truck, as a map — for the screens that draw a column per van.
 *
 * 🔴 ONE QUERY, NOT ONE PER VAN. Settings lists every van and the Event types grid draws a column
 * each; a read per van would be N round trips on a screen an operator opens to look at a few
 * switches. `readEventTypesForTruck` solves the same problem the same way.
 * ⚠️ A FAILURE RETURNS AN EMPTY MAP, which every caller reads as "every van follows the truck" —
 * today's behaviour for every van in the table.
 */
export async function readVanTakesCashForTruck(
  supabase: SupabaseClient,
  truckId: string,
): Promise<{ ok: boolean; byVanId: Map<string, boolean | null> }> {
  const byVanId = new Map<string, boolean | null>()
  try {
    const { data, error } = await supabase
      .from('truck_vans').select('id, takes_cash').eq('truck_id', truckId)
    if (error) {
      console.warn(`[van-cash] truck ${truckId}: ${why((error as { code?: string }).code)}; every van follows the truck`)
      return { ok: false, byVanId }
    }
    for (const r of (data as { id: string; takes_cash?: boolean | null }[] | null) ?? []) {
      byVanId.set(r.id, r.takes_cash ?? null)
    }
    return { ok: true, byVanId }
  } catch (e) {
    console.warn('[van-cash] truck read threw; every van follows the truck:', e instanceof Error ? e.message : String(e))
    return { ok: false, byVanId }
  }
}
