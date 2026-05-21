// lib/order-utils.ts
// Server-only helpers shared across order creation paths.

import { supabase } from '@/lib/supabase'

/** Atomically increment the per-truck order counter and return a zero-padded ID string. */
export async function nextOrderId(truckId: string): Promise<string> {
  const { data, error } = await supabase.rpc('increment_order_counter', {
    p_truck_id: truckId,
  })
  if (error) throw new Error(`Order counter failed: ${error.message}`)
  return String(data).padStart(4, '0')
}
