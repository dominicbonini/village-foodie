// lib/order-utils.ts
// Server-only helpers shared across order creation paths.

import { supabase } from '@/lib/supabase'

/** Generate the next sequential zero-padded order ID for a truck.
 *  Reads the highest existing ID for this truck and increments it.
 *  Retries up to 10 times if a concurrent insert beats us to the same number. */
export async function nextOrderId(truckId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: latest } = await supabase
      .from('orders')
      .select('id')
      .eq('truck_id', truckId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextNum = (parseInt(latest?.id || '0') || 0) + 1 + attempt
    const id = String(nextNum).padStart(4, '0')

    const { data: clash } = await supabase
      .from('orders')
      .select('id')
      .eq('truck_id', truckId)
      .eq('id', id)
      .maybeSingle()
    if (!clash) return id
  }
  throw new Error('Could not generate a unique order ID after 10 attempts')
}
