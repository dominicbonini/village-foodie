// lib/order-utils.ts
// Server-only helpers shared across order creation paths.

import { supabase } from '@/lib/supabase'

/**
 * Generate the next display number for an order.
 *
 * Per-event numbering: each event restarts at 1 (#1, #2, #3 ...). Backed by the
 * atomic DB function increment_event_order_counter(uuid) — UPDATE..RETURNING, so
 * concurrent callers serialise on the row lock and each gets a distinct number.
 * No read-max, no clash loop, no client-side retry — the DB is the single source.
 *
 * Falls back to the truck-level counter (increment_order_counter(text)) when there
 * is no event, or when the event RPC returns null (event deleted/cancelled mid-order).
 *
 * Returns a bare integer string ("1", "2", "5") — never zero-padded. This is the
 * ONLY place display numbers are generated, so the partial-unique index on the
 * text id column can never see "5" and "0005" for the same event.
 */
export async function nextOrderId(eventId: string | null, truckId: string): Promise<string> {
  if (eventId) {
    const { data, error } = await supabase.rpc('increment_event_order_counter', { p_event_id: eventId })
    if (!error && data != null) return String(data)
  }
  const { data, error } = await supabase.rpc('increment_order_counter', { p_truck_id: truckId })
  if (error || data == null) {
    throw new Error(`Failed to generate order number for truck ${truckId}: ${error?.message ?? 'no counter returned'}`)
  }
  return String(data)
}
