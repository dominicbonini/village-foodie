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
