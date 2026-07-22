// lib/delete-truck.ts
// Ordered, dependency-safe deletion of a truck and everything hanging off it.
//
// WHY THIS EXISTS: `DELETE FROM trucks WHERE id = $1` **FAILS ON ITS OWN**. Seven tables reference
// `trucks` with ON DELETE **NO ACTION**, so their rows survive every cascade and block the parent delete
// with an FK violation. `orders` is the guaranteed blocker (`orders.truck_id → trucks` is NO ACTION, and
// `orders.event_id → truck_events` is only SET NULL, so order rows outlive the events too).
//
// The NO-ACTION set below was READ FROM THE LIVE DB (July 2026 truth pass, docs/onboarding-flow.md §7.1) —
// it is not inferred from supabase/migrations/, which does not contain the FKs for the older core tables.
//
// ⚠️ NOT TRANSACTIONAL. supabase-js cannot open a transaction, so this is a sequence of statements. A
// failure part-way leaves a partially-deleted truck. That is acceptable for its two current callers —
// provision-truck's compensating delete (a truck seconds old, with nothing but a van) and admin-initiated
// teardown — but the Phase-3 scheduled cleanup job should move this into a Postgres function so the whole
// sequence is atomic. Until then: it THROWS on the first failing step, naming the step, rather than
// limping on and surfacing a confusing FK error from a later one.

import type { SupabaseClient } from '@supabase/supabase-js'

export class DeleteTruckError extends Error {
  readonly step: string
  readonly truckId: string
  constructor(step: string, truckId: string, cause: string) {
    super(`deleteTruckCascade failed at step "${step}" for truck ${truckId}: ${cause}`)
    this.name = 'DeleteTruckError'
    this.step = step
    this.truckId = truckId
  }
}

// Tables that reference trucks with ON DELETE NO ACTION → must be cleared explicitly, in this order,
// BEFORE the truck row itself. Postgres evaluates NO ACTION at end-of-statement, so a few of these might
// incidentally pass if a cascade clears them first (collection_times also cascades via event_id) — we do
// NOT rely on that. Explicit is deterministic.
const NO_ACTION_TABLES = [
  'orders',            // the guaranteed blocker
  'category_stock',
  'collection_times',
  'item_overrides',
  'order_counters',
  'slot_capacity',
] as const

/**
 * Delete a truck and all of its dependent rows, in FK-safe order.
 *
 * Everything not listed in NO_ACTION_TABLES cascades from the `trucks` delete: booking_locks, bundles_db,
 * discount_codes_db, excluded_terms, kds_sessions, menu_categories, menu_items_db, menu_subcategories,
 * modifier_groups, production_slot_usage, rejected_event_signatures, scraper_run_log, slot_bookings,
 * truck_events, truck_users, truck_vans, upsell_rules, van_devices, whatsapp_logs — plus, via truck_events:
 * collection_times, event_deals, event_option_stock, production_slot_usage.
 *
 * SET NULL (correct — deliberately NOT deleted): discovery_trucks.hatchgrab_truck_id, messages.truck_id.
 *
 * @throws {DeleteTruckError} on the first failing step.
 */
export async function deleteTruckCascade(
  supabase: SupabaseClient,
  truckId: string,
): Promise<void> {
  for (const table of NO_ACTION_TABLES) {
    const { error } = await supabase.from(table).delete().eq('truck_id', truckId)
    if (error) throw new DeleteTruckError(table, truckId, error.message)
  }

  // referrals uses its own column names (not truck_id) — a truck can appear on either side.
  const { error: refErr } = await supabase
    .from('referrals')
    .delete()
    .or(`referring_truck.eq.${truckId},referred_truck.eq.${truckId}`)
  if (refErr) throw new DeleteTruckError('referrals', truckId, refErr.message)

  const { error: truckErr } = await supabase.from('trucks').delete().eq('id', truckId)
  if (truckErr) throw new DeleteTruckError('trucks', truckId, truckErr.message)
}
