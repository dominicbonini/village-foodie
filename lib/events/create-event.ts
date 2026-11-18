// lib/events/create-event.ts — 🔴 THE ONE WAY A NEW EVENT IS MADE BY A PERSON (events-create-2, 17 November 2026).
//
// Extracted VERBATIM from Manage › Schedule's `upsert_event` create branch (app/api/manage/route.ts) so that the
// dashboard's "Create event now" (app/api/dashboard/action/route.ts `create_event_now`) makes events exactly the way
// Manage does. Manage calls the same functions in the same order, so its behaviour is unchanged:
//   1. insertTruckEvent      — van (the requested one, else the truck's only active van), the order-ready seed, the
//                              place link (resolveEventPlaceId: the picked place, else the place the typed name belongs
//                              to, created if new), then the insert;
//   2. (Manage only)         — the private tick, applied after the insert by the route;
//   3. seedEventDeals        — one event_deals row per available bundle, from its "apply to new events" default;
//   4. (Manage only)         — region / suburb, separate best-effort writes by the route;
//   5. refreshEventCapacity  — slot_capacity from the van's kitchen capacity, then the date's production_slot_usage.
// What differs between the two callers is passed in, never decided here: status ('confirmed' from Manage; 'open' from
// the dashboard, which also stamps opened_at), source ('manual' / 'dashboard') and auto open/close.
// ⚠️ THE INSERT BELOW IS THE STATEMENT THAT USED TO SIT IN THE ROUTE, with the same names and keys, plus `opened_at`
// (null from Manage — the column is nullable with no default, so an explicit null is the same write as before).
// scripts/schedule-graphics-places.cjs reads its keys and its `truck_place_id` from THIS file.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSoleActiveVanId, getVanOrderReadyDefault } from '@/lib/van-utils'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { generateSlots } from '@/lib/slots'
import { normalisePlaceName, resolvePlaceMerge, placesById, placeForTypedName, type Place as SgPlace } from '@/lib/schedule-graphics/places'

/**
 * The truck's place for a new event (moved here unchanged from app/api/manage/route.ts).
 *
 * 🔴 THREE OUTCOMES, AND `null` IS A FIRST-CLASS ONE:
 *   1. they picked a place → verify it is this truck's, follow any merge, use it;
 *   2. they typed a venue name → upsert the place for that normalised name and use it;
 *   3. anything unexpected → null, and matching falls back to the venue anchor and the name.
 *
 * ⚠️ IT SWALLOWS ITS OWN ERRORS ON PURPOSE. This runs in the middle of adding an event. A place table
 * that is missing (the migration not applied yet), a permission problem or a race must cost the LINK,
 * never the event — `truck_place_id` is an optimisation of matching, not a requirement for it.
 * ⚠️ THE MERGE IS FOLLOWED HERE TOO, so a picked place that has since been merged stores its target
 * rather than a row that is no longer in the list.
 */
export async function resolveEventPlaceId(
  supabase: SupabaseClient,
  truckId: string,
  pickedPlaceId: string | null,
  venueName: unknown,
  town: unknown,
): Promise<string | null> {
  try {
    if (pickedPlaceId) {
      // ⚠️ SCOPED BY `truck_id`: a place id is a uuid a client supplies, and one truck must never be
      // able to link its event to another truck's place.
      const { data } = await supabase
        .from('truck_places').select('id, merged_into_id').eq('truck_id', truckId)
      const all = (data ?? []) as SgPlace[]
      const picked = placesById(all).get(pickedPlaceId)
      if (picked) return resolvePlaceMerge(picked, placesById(all)).id
      // ⚠️ A LINK TO A PLACE THAT IS NO LONGER THIS TRUCK'S FALLS THROUGH TO THE NAME (12 October 2026),
      // rather than linking nothing. "Duplicate" now carries the original's link, and the original's
      // place may have gone since; the venue name still says where the copy is.
    }
    const name = String(venueName ?? '').trim()
    const name_key = normalisePlaceName(name)
    if (!name_key) return null
    /* 🔴 AN EXISTING PLACE FIRST, "The" OR NO "The" (12 October 2026). "The Five Bells" beside a place
     * called "Five Bells" used to create a second, empty place — see `placeForTypedName`. Only when
     * nothing matches does the upsert below make a new one, exactly as before. */
    {
      const { data: existing } = await supabase
        .from('truck_places').select('id, name_key, merged_into_id').eq('truck_id', truckId)
      const rows = (existing ?? []) as (SgPlace & { name_key?: string | null })[]
      const hit = placeForTypedName(name_key, rows)
      if (hit) return resolvePlaceMerge(hit, placesById(rows)).id
    }
    /* 🔴 THE SAME IDEMPOTENT RULE AS THE SEEDER — `on conflict (truck_id, name_key) do nothing`, so
     * two events added at the same moment for a new venue produce ONE place. `ignoreDuplicates` then a
     * read-back: never `do update`, which would overwrite a name the operator had edited. */
    await supabase.from('truck_places').upsert(
      { truck_id: truckId, venue_id: null, name_key, name, area: String(town ?? '').trim() || null },
      { onConflict: 'truck_id,name_key', ignoreDuplicates: true },
    )
    const { data: row } = await supabase
      .from('truck_places').select('id, merged_into_id').eq('truck_id', truckId).eq('name_key', name_key).maybeSingle()
    if (!row) return null
    const place = row as SgPlace
    if (!place.merged_into_id) return place.id
    const { data: all } = await supabase.from('truck_places').select('id, merged_into_id').eq('truck_id', truckId)
    return resolvePlaceMerge(place, placesById((all ?? []) as SgPlace[])).id
  } catch (e) {
    console.warn('[resolveEventPlaceId] no place linked:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** The fields a caller supplies for a new event. Everything not here is resolved (van, order-ready, place) or defaulted. */
export interface NewEventFields {
  venue_name: unknown
  town?: unknown
  postcode?: unknown
  address?: unknown
  event_date: unknown
  start_time: unknown
  end_time: unknown
  notes?: unknown
  latitude?: unknown
  longitude?: unknown
  /** The van the person chose; null/undefined → the truck's only active van, else none. */
  van_id?: string | null
  /** The place the person picked (a uuid of this truck's place), or null to resolve it from the typed name. */
  picked_place_id?: string | null
  /** An event type ALREADY validated as this truck's, or null for Standard. */
  event_type_id?: string | null
  status: 'confirmed' | 'open'
  source: 'manual' | 'dashboard'
  auto_open: boolean
  auto_close: boolean
  /** Set when the event is created already started (the dashboard); null from Manage. */
  opened_at?: string | null
}

/**
 * Insert a new event for `truckId` the way Manage always has. Returns the inserted row (or the database error).
 * ⚠️ THE ORDER-READY SEED IS SKIPPED WHEN A TYPE IS CHOSEN — see the note in the route this came from: a seeded value would
 * make the type's mark-ready setting permanently inert on this event.
 */
export async function insertTruckEvent(
  supabase: SupabaseClient,
  truckId: string,
  f: NewEventFields,
  now: string = new Date().toISOString(),
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const { venue_name, town, postcode, address, event_date, start_time, end_time, notes, latitude, longitude, van_id } = f
  const targetTruckId = truckId
  const eventStatus = f.status
  // FIX 3 (single-van auto-assign): if the operator didn't pick a van and the truck has exactly one active van, assign
  // it so capacity etc. can resolve. Multi-van trucks leave van selection to the operator (van_id stays null).
  const resolvedVanId = van_id ?? await getSoleActiveVanId(supabase, targetTruckId)
  // Seed order_ready_override from the van's current default so the new event starts matching the Settings master switch.
  const seededOrderReady = await getVanOrderReadyDefault(supabase, targetTruckId, resolvedVanId)
  const resolvedPlaceId = await resolveEventPlaceId(supabase, targetTruckId, f.picked_place_id ?? null, venue_name, town)
  const typedEventTypeId = f.event_type_id ?? null
  const { data, error } = await supabase.from('truck_events').insert({ truck_id: targetTruckId, venue_name, town: town ?? null, postcode: postcode ?? null, address, event_date, start_time, end_time, notes, latitude: latitude ?? null, longitude: longitude ?? null, van_id: resolvedVanId ?? null, order_ready_override: typedEventTypeId ? null : seededOrderReady, order_ready_source: typedEventTypeId ? null : 'seed', event_type_id: typedEventTypeId, source: f.source, status: eventStatus, confirmed_at: now, auto_open: f.auto_open, auto_close: f.auto_close, truck_place_id: resolvedPlaceId, opened_at: f.opened_at ?? null }).select().single()
  return { data: (data as Record<string, unknown> | null) ?? null, error: error ? { message: error.message } : null }
}

/** Auto-create event_deals from the truck's current bundle defaults (unchanged from Manage). */
export async function seedEventDeals(supabase: SupabaseClient, truckId: string, eventId: unknown): Promise<void> {
  const newEventId = eventId
  const { data: bundles } = await supabase
    .from('bundles_db')
    .select('id, apply_to_new_events')
    .eq('truck_id', truckId)
    .eq('is_available', true)

  if (bundles && bundles.length > 0 && newEventId) {
    const eventDeals = bundles.map((bundle: { id: string; apply_to_new_events: boolean }) => ({
      event_id: newEventId,
      bundle_id: bundle.id,
      active: bundle.apply_to_new_events,
      overridden: false,
    }))
    await supabase
      .from('event_deals')
      .upsert(eventDeals, { onConflict: 'event_id,bundle_id', ignoreDuplicates: true })
  }
}

/**
 * After an event is saved (created OR edited — Manage runs this for both): slot_capacity rows from the van's kitchen
 * capacity, then the date's production_slot_usage rebuilt from its orders. Best-effort; never blocks the save.
 */
export async function refreshEventCapacity(
  supabase: SupabaseClient,
  truckId: string,
  savedEvent: { van_id?: unknown } | null,
  event_date: unknown,
  start_time: unknown,
  end_time: unknown,
): Promise<void> {
  const targetTruckId = truckId
  // Write slot_capacity rows from van kitchen_capacity if a van is assigned
  if (savedEvent?.van_id && start_time && end_time) {
    const { data: van } = await supabase
      .from('truck_vans')
      .select('kitchen_capacity')
      .eq('id', savedEvent.van_id as string)
      .single()

    if (van?.kitchen_capacity) {
      const slots = generateSlots(String(start_time), String(end_time), 5)
      const rows = slots.map((slot: string) => ({
        truck_id: targetTruckId,
        event_date,
        slot,
        max_orders: van.kitchen_capacity,
      }))
      await supabase
        .from('slot_capacity')
        .upsert(rows, { onConflict: 'truck_id,event_date,slot' })
    }
  }

  // Gap 3: self-heal production_slot_usage whenever an event is created/confirmed,
  // alongside the slot_capacity regen. Best-effort — never block the event save.
  if (event_date) {
    try {
      await rebuildProductionSlotUsage(supabase, targetTruckId, String(event_date))
    } catch (err) {
      console.warn('[upsert_event] production_slot_usage rebuild failed (drift risk):', err)
    }
  }
}
