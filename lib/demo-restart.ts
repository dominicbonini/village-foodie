// lib/demo-restart.ts
// "Start a new service" — the demo's answer to an elapsed event.
//
// ── WHAT THIS REPLACES, AND WHY ────────────────────────────────────────────────────────────────────
// This supersedes lib/demo-event-refresh.ts (rollDemoEventIfStale), which SHIFTED an elapsed event
// forward on every dashboard load. Three failures killed that approach, all confirmed in live data:
//
//   1. ⛔ IT BREACHED THE CAPACITY GUARANTEE. The roll wrote order slots directly, bypassing the seeder,
//      and clamped every overshooting slot with `Math.min(shifted, newEnd)`. Rolling a 3h board into a
//      midnight-clamped window put 15 orders on 23:59 — far past the mains batch. peakPerSlot's promise
//      is a property of the SEEDER; nothing that writes slots behind its back can honour it.
//   2. A bad board stayed bad. The roll preserved the previous distribution exactly, so a compressed
//      board rolled forward into a compressed board, forever.
//   3. ⛔ THE VISITOR'S OWN ORDER CAME BACK. An order placed at 23:40 reappeared at 09:45 the next
//      morning, shifted along with the seeded ones and indistinguishable from them.
//
// ── THE MODEL: AN ELAPSED DEMO ENDS ───────────────────────────────────────────────────────────────
// A real truck's yesterday tickets do not turn up on today's board. Orders from a previous service are
// not real and must not carry over. So an elapsed demo ENDS, visibly, and the visitor starts a new
// service — which wipes the old event AND its orders and seeds a fresh board for the current time.
// Nothing is shifted, nothing is inherited, and the new board is provisioned by exactly the same code
// path as a first-run demo, so it cannot drift from one.
//
// ── WHY THE WIPE IS TRUCK-WIDE, NOT DATE-SCOPED ───────────────────────────────────────────────────
// provisionDemoEvent(replaceExisting) clears by (truck_id, event_date) — correct for re-provisioning
// within one session, and NOT enough here. The case this exists for is a visitor returning the NEXT
// MORNING, where the stale event carries yesterday's date and a date-scoped delete would sail straight
// past it, leaving the old event and its orders live alongside the new ones. That is bug 3 above.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'
import { provisionDemoEvent, type DemoEvent } from '@/lib/provision-demo-event'
import { seedDemoOrders } from '@/lib/seed-demo-orders'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { DEMO_MAINS_BATCH } from '@/lib/provision-demo'

export class DemoRestartError extends Error {
  constructor(message: string) { super(message); this.name = 'DemoRestartError' }
}

export interface RestartResult {
  event: DemoEvent
  ordersDeleted: number
  eventsDeleted: number
  seededOrders: number
  warnings: string[]
}

/**
 * Wipe a demo truck's service and provision a fresh one for `now`.
 *
 * 🔴 DEMO ONLY, and guarded on the truck id rather than trusted from the caller — this deletes every
 * order a truck has. `demo-` is a reserved prefix no operator truck can carry (lib/demo.ts), so the
 * guard is a hard boundary, not a convention.
 *
 * THE MENU IS NOT TOUCHED. No re-extraction, no re-commit: the menu is what the visitor built and the
 * one thing that must survive a restart. This function never reads or writes menu tables.
 */
export async function restartDemoService(
  supabase: SupabaseClient,
  truckId: string,
  opts: { now?: Date; tz?: string } = {},
): Promise<RestartResult> {
  if (!isDemoIdentifier(truckId)) {
    throw new DemoRestartError('restartDemoService refused: not a demo truck')
  }
  const now = opts.now ?? new Date()
  const warnings: string[] = []

  // ── 1. Wipe the old service, truck-wide ─────────────────────────────────────────────────────────
  // ORDER MATTERS. orders.event_id is ON DELETE SET NULL, so order rows OUTLIVE their event — deleting
  // events first would leave every order dangling with a null event_id, still counted by the capacity
  // engine (which reads by DATE, not by event). Same ordering lesson as lib/delete-truck.ts and as
  // provisionDemoEvent's own replaceExisting block.
  const { data: oldOrders, error: ordSelErr } = await supabase
    .from('orders').select('order_key').eq('truck_id', truckId)
  if (ordSelErr) throw new DemoRestartError(`Failed reading demo orders: ${ordSelErr.message}`)
  const ordersDeleted = (oldOrders ?? []).length

  if (ordersDeleted > 0) {
    const { error } = await supabase.from('orders').delete().eq('truck_id', truckId)
    if (error) throw new DemoRestartError(`Failed clearing demo orders: ${error.message}`)
  }

  const { data: oldEvents, error: evSelErr } = await supabase
    .from('truck_events').select('id').eq('truck_id', truckId)
  if (evSelErr) throw new DemoRestartError(`Failed reading demo events: ${evSelErr.message}`)
  const eventsDeleted = (oldEvents ?? []).length

  if (eventsDeleted > 0) {
    const { error } = await supabase.from('truck_events').delete().eq('truck_id', truckId)
    if (error) throw new DemoRestartError(`Failed clearing demo events: ${error.message}`)
  }

  // slot_capacity and production_slot_usage are keyed (truck_id, event_date, slot) — NOT by event — so
  // they are cleared by TRUCK here, not by date. A date-scoped clear would strand yesterday's grid, and
  // the capacity engine reads by date, so a stranded grid is a live wrong answer rather than dead rows.
  const { error: capErr } = await supabase.from('slot_capacity').delete().eq('truck_id', truckId)
  if (capErr) throw new DemoRestartError(`Failed clearing slot_capacity: ${capErr.message}`)
  const { error: usageErr } = await supabase.from('production_slot_usage').delete().eq('truck_id', truckId)
  if (usageErr) throw new DemoRestartError(`Failed clearing production_slot_usage: ${usageErr.message}`)

  // ── 2. Fresh event from demoEventWindow(now) ────────────────────────────────────────────────────
  // replaceExisting:false — step 1 already removed everything, truck-wide rather than for one date.
  // Running the date-scoped delete again would be a redundant round trip against empty tables.
  // provisionDemoEvent owns the half-hour floor, the fixed 3h length and the midnight clamp, and also
  // writes slot_capacity and runs the first occupancy rebuild.
  let event: DemoEvent
  try {
    event = await provisionDemoEvent(supabase, truckId, { now, tz: opts.tz, replaceExisting: false })
  } catch (err) {
    throw new DemoRestartError(
      `New service event failed: ${err instanceof Error ? err.message : 'unknown'}`)
  }

  // ── 3. Re-seed against the NEW window ───────────────────────────────────────────────────────────
  // Same call shape as first-run provisioning (lib/provision-demo.ts), so a restarted board and a
  // freshly provisioned one are produced by identical code. `now` drives the seeder's first-collection
  // floor; the order COUNT now scales to the window's bookable slots (see seed-demo-orders).
  let seededOrders = 0
  try {
    const seeded = await seedDemoOrders(supabase, {
      truckId, eventId: event.id, eventDate: event.event_date,
      startTime: event.start_time, endTime: event.end_time,
      capacity: DEMO_MAINS_BATCH,
      now,
      tz: opts.tz,
    })
    seededOrders = seeded.inserted
    if (seeded.skippedNoMenu) warnings.push('No menu items to seed orders from — board left empty.')

    // ── 4. Rebuild occupancy (§9.3 #2) ────────────────────────────────────────────────────────────
    // provisionDemoEvent already ran a rebuild, but against an EMPTY board. Without this second pass
    // the seeded orders sit there occupying nothing and every slot reads green — a full board over an
    // all-green slot map, which is the single most damaging first impression the demo can give.
    if (seeded.inserted > 0) {
      await rebuildProductionSlotUsage(supabase, truckId, event.event_date)
    }
  } catch (err) {
    // Non-fatal, matching first-run provisioning: a live event with an empty board is still playable —
    // the visitor can place their own order, which is the loop that matters. Losing the restart over
    // decoration would be the wrong trade.
    warnings.push(`Order seeding failed (non-fatal): ${err instanceof Error ? err.message : 'unknown'}`)
  }

  return { event, ordersDeleted, eventsDeleted, seededOrders, warnings }
}
