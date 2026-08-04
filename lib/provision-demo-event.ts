// lib/provision-demo-event.ts
// The demo's live event + its slot grid.
//
// WHY NOT `upsert_event` (app/api/manage/route.ts)? That route is the ONLY path operator event creation
// flows through, for live trading trucks, and it is token-authed HTTP. Adding a status parameter would put
// the cost of a demo feature on the live path; calling it would mean a self-fetch. A demo event also isn't
// the same operation: status 'open' not 'confirmed', no venue, no geocode, no event_deals.
//
// So this writes directly — but reuses every piece of REAL logic that is already exported:
//   getSoleActiveVanId / getVanOrderReadyDefault (lib/van-utils)  · rebuildProductionSlotUsage
//   (lib/slot-bookings) · generateSlots (lib/slots, extracted for exactly this).
// The only duplication is the ~10-line slot_capacity upsert, which is visible and cheap; a regression in
// upsert_event would be invisible until an operator couldn't create an event.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSoleActiveVanId, getVanOrderReadyDefault } from '@/lib/van-utils'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { generateSlots } from '@/lib/slots'
import { getLocalDateInTz } from '@/lib/time-utils'

/** Slot interval, matching upsert_event's hard-coded 5 (NOT capacity_window_mins — a different axis). */
const SLOT_INTERVAL_MINS = 5

/** truck_events.venue_name is NOT NULL with no default, so a demo event needs one. USER-VISIBLE: the
 *  dashboard event bar and the customer order page both render it. */
export const DEMO_VENUE_NAME = 'Demo event'

export interface DemoEvent {
  id: string
  event_date: string
  start_time: string
  end_time: string
  van_id: string | null
  slotCount: number
}

export class DemoEventError extends Error {
  constructor(message: string) { super(message); this.name = 'DemoEventError' }
}

/**
 * The demo window: start = now floored to the nearest HALF HOUR (:00 or :30); end = start + 3h.
 * Times are venue-local wall clock (the whole engine treats them that way), so `now` is read in the
 * truck's timezone rather than the server's UTC.
 *
 * WHY HALF-HOUR FLOOR + FIXED 3h (replaces the old "next whole hour, +2h"): the previous rule snapped the
 * END to a whole hour but left the START on its minute, producing a VARIABLE window length (2h05–3h00). A
 * fixed 3h length off a clean :00/:30 start makes the board reproducible and the same shape every time,
 * and — critically — means "Start a new service" (lib/demo-restart) re-derives an identical window rather
 * than propagating whatever legacy length a demo happened to be provisioned with.
 *
 * ⚠️ THE START CAN BE UP TO 29 MIN IN THE PAST. That is deliberate (a clean :00/:30 anchor reads better on
 * the board than a 5-min grid time), and the seeder compensates: seed-demo-orders floors the first
 * collection to max(start+10, now+10), so no order lands in an already-elapsed slot.
 *
 * MIDNIGHT CLAMP: a single truck_events row is one event_date and the slot engine assumes end > start on
 * that date, so the window must never cross 24:00. If start+3h would reach/pass midnight, end is clamped
 * to '23:59' (a shorter late-evening window). Guaranteed end > start: start is floored to ≤ 23:30, so
 * '23:59' is always after it.
 */
export const DEMO_WINDOW_HOURS = 3

export function demoEventWindow(now: Date, tz = 'Europe/London'): { date: string; start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  const h = Number(get('hour'))
  const m = Number(get('minute'))

  // Floor the START to the nearest half hour (:00 or :30). A clean anchor reads better than a 5-min-grid
  // wall-clock time, and every generated slot stays on the 5-min grid because 30 is a multiple of 5.
  const startMins = h * 60 + (m < 30 ? 0 : 30)
  const start = toHHMM(startMins)

  // Fixed 3h length, clamped so the window can't cross midnight (see header). start ≤ 23:30 → '23:59' is
  // always after start, so end > start holds even in the clamped case.
  const rawEndMins = startMins + DEMO_WINDOW_HOURS * 60
  const end = rawEndMins >= 24 * 60 ? '23:59' : toHHMM(rawEndMins)

  return { date: getLocalDateInTz(tz), start, end }
}

/** minutes-since-midnight → 'HH:MM'. Shared by the window rule and (via export) the roll. */
export function toHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/**
 * Create the demo truck's live event and its slot_capacity grid.
 *
 * RE-PROVISIONING: pass `replaceExisting` (the default) to delete this truck's events for the SAME DATE
 * first. slot_capacity is keyed on (truck_id, event_date, slot) — NOT event_id — so a second same-day
 * event would silently overwrite the first's capacity rows and leave two events fighting over one grid.
 * Deleting first is the only correct shape for the return-visit path.
 */
export async function provisionDemoEvent(
  supabase: SupabaseClient,
  truckId: string,
  opts: { now?: Date; tz?: string; replaceExisting?: boolean } = {},
): Promise<DemoEvent> {
  const tz = opts.tz ?? 'Europe/London'
  const { date, start, end } = demoEventWindow(opts.now ?? new Date(), tz)
  const replaceExisting = opts.replaceExisting !== false

  // ── Re-provision: clear the previous demo day ────────────────────────────────────────────────────
  if (replaceExisting) {
    // Orders first: orders.event_id is ON DELETE SET NULL, so order rows OUTLIVE their event and would be
    // left dangling (and still counted by the capacity engine, which reads by date). Same ordering lesson
    // as the truck cascade in lib/delete-truck.ts.
    const { data: oldEvents } = await supabase
      .from('truck_events').select('id').eq('truck_id', truckId).eq('event_date', date)
    const oldIds = (oldEvents ?? []).map(e => e.id as string)
    if (oldIds.length) {
      const { error: ordErr } = await supabase.from('orders').delete().in('event_id', oldIds)
      if (ordErr) throw new DemoEventError(`Failed clearing previous demo orders: ${ordErr.message}`)
      const { error: evErr } = await supabase.from('truck_events').delete().in('id', oldIds)
      if (evErr) throw new DemoEventError(`Failed clearing previous demo event: ${evErr.message}`)
    }
    // slot_capacity + production_slot_usage are date-keyed, not event-keyed → clear by date.
    await supabase.from('slot_capacity').delete().eq('truck_id', truckId).eq('event_date', date)
    await supabase.from('production_slot_usage').delete().eq('truck_id', truckId).eq('event_date', date)
  }

  // ── The event ────────────────────────────────────────────────────────────────────────────────────
  const vanId = await getSoleActiveVanId(supabase, truckId)
  const orderReady = await getVanOrderReadyDefault(supabase, truckId, vanId)
  const nowIso = (opts.now ?? new Date()).toISOString()

  const { data: event, error } = await supabase
    .from('truck_events')
    .insert({
      truck_id: truckId,
      event_date: date,
      start_time: start,
      end_time: end,
      // 🔴 venue_name IS NOT NULL WITH NO DEFAULT (confirmed empirically, scripts/diag-demo-event.mjs).
      // It must be supplied explicitly — OMITTING IT FAILS EXACTLY LIKE SENDING null, because there is no
      // default for the omission to fall back to.
      //
      // ⚠️ THE RULE, stated properly because the first fix got it wrong: omitting a column only helps when
      // that column HAS A DEFAULT. `NOT NULL DEFAULT ''` (the trucks.whatsapp case — reference-manual
      // §933) tolerates omission and rejects explicit null. `NOT NULL` with NO default rejects BOTH. They
      // look the same from the app and are not; only the live schema distinguishes them.
      //
      // A demo has no real location, but this string is USER-VISIBLE — the dashboard event bar and the
      // customer order page both render venue_name — so it has to read sensibly, not be filler.
      venue_name: DEMO_VENUE_NAME,
      // town / postcode / address / latitude / longitude are genuinely nullable (probed the same way), so
      // they stay omitted — a demo has nothing truthful to put in them.
      van_id: vanId,
      order_ready_override: orderReady,
      // ── G3: THE BUZZER PROMPT, OFF FOR DEMOS ──────────────────────────────────────────────────
      // 🔴 IT HAD TO BE HERE, AND THAT IS THE ORDERING FINDING. The obvious home was
      // ProvisionProfile, beside the pool — but provisionTruck writes `trucks` and `truck_vans` and
      // creates NO event, so at provision time there is no truck_events row for this to live on. It
      // belongs on the insert that brings the row into existence, which is this one: demo-only, and
      // no restructuring of the sequence to fit it.
      //
      // 🔴 AND IT IS NOT OPTIONAL ONCE THE POOL IS SET. resolveBuzzerPrompt (lib/buzzer.ts:83-90)
      // resolves the prompt as `event.buzzer_prompt ?? true` whenever a pool exists — NULL means ON.
      // So the demo profile's buzzer_count:10 would, on its own, make every test order in the demo
      // stop and demand a buzzer number. `false` here is what makes the pool explorable without the
      // prompt interrupting the one thing a prospect is there to do.
      // Explicit false, never omitted: the column is nullable and omission would resolve to ON.
      buzzer_prompt: false,
      source: 'manual',
      // LIVE from the first paint. upsert_event hard-codes 'confirmed' and relies on the auto-event-
      // scheduler (a cron edge function) to flip it — a demo can't wait for the next tick.
      status: 'open',
      confirmed_at: nowIso,
      // ⚠️ opened_at MUST be set alongside status:'open'. /api/events selects and exposes it as the
      // operator-STARTED signal customer surfaces derive "live" from, so status without it is an
      // inconsistent state visible to the customer order page.
      opened_at: nowIso,
      // No auto-close: a demo left open overnight should still work when they come back, and the
      // scheduler's prior-day sweep would otherwise close it. auto_open is moot (already open).
      auto_open: false,
      auto_close: false,
    })
    .select('id, event_date, start_time, end_time, van_id')
    .single()

  if (error || !event) {
    throw new DemoEventError(`Demo event insert failed: ${error?.message ?? 'unknown'}`)
  }

  // ── slot_capacity from the van's kitchen_capacity ────────────────────────────────────────────────
  // Without this the capacity engine has no ceiling to enforce and every slot reads green — the demo
  // would silently lose the headline benefit it exists to show.
  // FIX 6 — a NULL kitchen_capacity is now a valid demo configuration, not an error. With no van-level
  // total, the engine treats the global ceiling as UNLIMITED (slot-availability.ts: `kitchenCapacity ??
  // UNLIMITED`) and the per-category BATCH becomes the only ceiling — `used >= batch` still drives red,
  // partial still drives amber (slot-availability.ts:721-726). One number, and the global-ceiling veto
  // that produced the "over capacity — review" banner is gone with it.
  let slotCount = 0
  if (event.van_id) {
    const { data: van } = await supabase
      .from('truck_vans').select('kitchen_capacity').eq('id', event.van_id as string).single()
    if (van?.kitchen_capacity) {
      const slots = generateSlots(start, end, SLOT_INTERVAL_MINS)
      const rows = slots.map(slot => ({
        truck_id: truckId, event_date: date, slot, max_orders: van.kitchen_capacity,
      }))
      const { error: capErr } = await supabase
        .from('slot_capacity').upsert(rows, { onConflict: 'truck_id,event_date,slot' })
      if (capErr) throw new DemoEventError(`slot_capacity write failed: ${capErr.message}`)
      slotCount = rows.length
    } else {
      // No van-level total → no slot_capacity rows. Deliberate, not a failure: the category batch is the
      // ceiling now. (slot_capacity is read only by manage's save_slot_capacity path, never by the demo.)
      slotCount = 0
    }
  } else {
    throw new DemoEventError('No active van resolved — the demo would have no capacity model')
  }

  // ── production_slot_usage ────────────────────────────────────────────────────────────────────────
  // rebuildProductionSlotUsage THROWS by design (swallowing it was a real bug — see lib/slot-bookings).
  // upsert_event downgrades that to a console.warn; the provisioner deliberately does NOT inherit that.
  // A demo whose occupancy model failed to build is a broken demo, and it should fail loudly here rather
  // than paint green lights over a missing model.
  await rebuildProductionSlotUsage(supabase, truckId, date)

  return {
    id: event.id as string,
    event_date: date,
    start_time: start,
    end_time: end,
    van_id: (event.van_id as string) ?? null,
    slotCount,
  }
}
