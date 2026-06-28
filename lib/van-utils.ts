// lib/van-utils.ts
// Shared van helpers used across event create/confirm paths.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the truck's sole active van id, or null if it has zero or 2+ active vans.
 * Used to auto-assign a van to a new/confirmed event ONLY for single-van trucks
 * (Manual s.14 — multi-van trucks leave van selection to the operator).
 */
export async function getSoleActiveVanId(
  supabase: SupabaseClient,
  truckId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('truck_vans')
    .select('id')
    .eq('truck_id', truckId)
    .eq('active', true)
  if (!data || data.length !== 1) return null
  return data[0].id as string
}

/**
 * The van's current order-ready default (truck_vans.order_ready_enabled), used to SEED a new event's
 * order_ready_override at creation (master-switch model — new events start matching the Settings
 * default). Resolves the given van, else the truck's sole active van. Returns null if no van resolves
 * (multi-van, none given) → the event keeps order_ready_override = null and effectiveOrderReady's ??
 * fallback covers it.
 */
export async function getVanOrderReadyDefault(
  supabase: SupabaseClient,
  truckId: string,
  vanId?: string | null
): Promise<boolean | null> {
  const id = vanId ?? await getSoleActiveVanId(supabase, truckId)
  if (!id) return null
  const { data } = await supabase
    .from('truck_vans')
    .select('order_ready_enabled')
    .eq('id', id)
    .single()
  return data?.order_ready_enabled ?? null
}
