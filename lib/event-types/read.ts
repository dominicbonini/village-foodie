// lib/event-types/read.ts — reading an event's type from the database, safely.
//
// ── 🔴 EVERY READ HERE IS CAPABILITY-PROBED, AND THAT IS THE WHOLE POINT OF THE FILE ──────────────
// The columns and the table this reads are added by 20261009_event_types.sql. PostgREST answers
// PGRST204/PGRST205 and Postgres answers 42703 for something they cannot see, and a NAMED select that
// hits one FAILS THE WHOLE STATEMENT. `app/api/dashboard/route.ts` reads `truck_events` with exactly
// such a select, and its own comment records what one absent column does there: it blanks the
// operator's board.
//
// So these reads are SEPARATE and every failure resolves to "this event has no type", which is
// today's behaviour for every event in the table. That makes a code-before-migration deploy a no-op
// rather than an outage — the same discipline `readEventIntervals` follows
// (lib/slot-interval.ts:252-262) and for the same reason.
//
// ⚠️ THE CODE MAY THEREFORE DEPLOY BEFORE THE MIGRATION. That is not permission to do so — the screen
// will report no types until it is applied — it is insurance that the order cannot break a service.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventType } from './types'
import type { OrderReadySource } from './resolve'

/** The columns a resolver needs from the type row. */
const TYPE_COLS = 'id, truck_id, name, sort_order, buzzer_prompt, takes_cash, order_ready, collection_interval_mins'

/** What one event contributes to the resolvers, beyond the columns its callers already hold. */
export interface EventTypeRead {
  /** false when the read failed — the caller may log it; the answer is still safe to use. */
  ok: boolean
  type: EventType | null
  /** `truck_events.order_ready_source`, for resolveOrderReadyWithType. */
  orderReadySource: OrderReadySource
}

export const NO_EVENT_TYPE: EventTypeRead = { ok: true, type: null, orderReadySource: null }

const why = (code: string | undefined): string =>
  code === 'PGRST205' ? 'the event_types table is not in PostgREST’s schema cache (PGRST205) — reload the schema'
  : code === 'PGRST204' ? 'a column is not in PostgREST’s schema cache (PGRST204) — reload the schema'
  : code === '42703' ? 'the columns are absent (42703) — migration 20261009 has not been applied'
  : `read failed (${code ?? 'no code'})`

/**
 * One event's type, by event id.
 *
 * 🔴 ONE ROUND TRIP, NOT TWO. The embed `event_types!event_type_id (…)` fetches the type with the
 * event, so a dashboard poll does not gain a second query. A failure of the embed reads as no type.
 * ⚠️ `truck_id` IS NOT A FILTER HERE because the caller has already resolved this event id against
 * its own truck — every call site below passes an id it just read from a truck-scoped query. Adding a
 * join to re-check it would cost a round trip to re-prove something already proved.
 */
export async function readEventType(
  supabase: SupabaseClient,
  eventId: string | null | undefined,
): Promise<EventTypeRead> {
  if (!eventId) return NO_EVENT_TYPE
  try {
    const { data, error } = await supabase
      .from('truck_events')
      .select(`order_ready_source, event_types!event_type_id (${TYPE_COLS})`)
      .eq('id', eventId)
      .maybeSingle()
    if (error) {
      console.warn(`[event-types] event ${eventId}: ${why((error as { code?: string }).code)}; the event has no type`)
      return { ok: false, type: null, orderReadySource: null }
    }
    const row = data as { order_ready_source?: string | null; event_types?: EventType | EventType[] | null } | null
    /* ⚠️ PostgREST RETURNS AN EMBED AS AN OBJECT OR AN ARRAY depending on how it reads the
     * relationship, and a one-row embed has arrived as both in this codebase. Normalising here means
     * no caller has to care. */
    const embedded = row?.event_types
    const type = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null
    return {
      ok: true,
      type: type ?? null,
      orderReadySource: (row?.order_ready_source as OrderReadySource) ?? null,
    }
  } catch (e) {
    console.warn(`[event-types] event ${eventId}: read threw; the event has no type:`, e instanceof Error ? e.message : String(e))
    return { ok: false, type: null, orderReadySource: null }
  }
}

/** Every type a truck has, in the screen's order. A failure reads as "no types", i.e. today. */
export async function readTypesForTruck(
  supabase: SupabaseClient,
  truckId: string,
): Promise<{ ok: boolean; types: EventType[] }> {
  try {
    const { data, error } = await supabase
      .from('event_types')
      .select(TYPE_COLS)
      .eq('truck_id', truckId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      console.warn(`[event-types] truck ${truckId}: ${why((error as { code?: string }).code)}; no types`)
      return { ok: false, types: [] }
    }
    return { ok: true, types: (data as EventType[] | null) ?? [] }
  } catch (e) {
    console.warn(`[event-types] truck ${truckId}: read threw; no types:`, e instanceof Error ? e.message : String(e))
    return { ok: false, types: [] }
  }
}

/**
 * "The usual type for this place" — decision 5, worked out when needed, with no defaults table.
 *
 * 🔴 THE TYPE OF THE TRUCK'S MOST RECENT EVENT AT THE SAME NORMALISED VENUE NAME. Normalised by
 * `normalisePlaceName`, which is the ONE matching function `truck_places.name_key` is defined as —
 * so "The Bull & Butcher" and "the bull and butcher" are the same place here exactly as they are
 * everywhere else. A second normaliser would silently disagree with the places list.
 *
 * ⚠️ MOST RECENT BY DATE, AND PAST EVENTS COUNT. The question is "what did I last do here?", which a
 * future booking cannot answer better than the last actual visit. Ties break on the later start time.
 * ⚠️ NULL IS A REAL ANSWER and means Standard: a place the truck last traded at without a type is a
 * place whose usual type IS Standard, and offering the type from two visits ago would be worse.
 * ⚠️ BOUNDED AT 200 EVENTS. A truck with more history than that at other venues still gets an answer
 * for its frequent places, which are the ones in the picker.
 */
export async function usualTypeForVenue(
  supabase: SupabaseClient,
  truckId: string,
  venueName: string | null | undefined,
  normalise: (s: string) => string,
): Promise<{ ok: boolean; typeId: string | null }> {
  const key = normalise(String(venueName ?? ''))
  if (!key) return { ok: true, typeId: null }
  try {
    const { data, error } = await supabase
      .from('truck_events')
      .select('venue_name, event_type_id, event_date, start_time')
      .eq('truck_id', truckId)
      .order('event_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(200)
    if (error) {
      console.warn(`[event-types] usual type for truck ${truckId}: ${why((error as { code?: string }).code)}; Standard`)
      return { ok: false, typeId: null }
    }
    for (const row of (data as { venue_name: string | null; event_type_id: string | null }[] | null) ?? []) {
      if (normalise(String(row.venue_name ?? '')) === key) return { ok: true, typeId: row.event_type_id ?? null }
    }
    return { ok: true, typeId: null }
  } catch (e) {
    console.warn(`[event-types] usual type read threw; Standard:`, e instanceof Error ? e.message : String(e))
    return { ok: false, typeId: null }
  }
}

/** How many UPCOMING events use each type — the "Used by: N upcoming events" line. */
export async function countUpcomingByType(
  supabase: SupabaseClient,
  truckId: string,
  today: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  try {
    const { data, error } = await supabase
      .from('truck_events')
      .select('event_type_id')
      .eq('truck_id', truckId)
      .gte('event_date', today)
      .not('event_type_id', 'is', null)
      .limit(1000)
    if (error) {
      console.warn(`[event-types] upcoming counts for truck ${truckId}: ${why((error as { code?: string }).code)}; zeroes`)
      return out
    }
    for (const row of (data as { event_type_id: string | null }[] | null) ?? []) {
      if (row.event_type_id) out[row.event_type_id] = (out[row.event_type_id] ?? 0) + 1
    }
    return out
  } catch {
    return out
  }
}

/**
 * Every upcoming event's type, for one truck, as a map — for callers that loop over events.
 *
 * 🔴 TWO PROBED QUERIES, NOT ONE PER EVENT. `app/api/events/route.ts` maps up to 50 events and
 * publishes each one's customer collection grid; reading a type per event would be 50 round trips on a
 * public endpoint. `readEventIntervalsForTruck` solves the same problem the same way, and this is
 * deliberately shaped like it.
 *
 * ⚠️ IT IS A SEPARATE READ RATHER THAN A COLUMN ON THE CALLER'S OWN SELECT, for the reason the whole
 * of this file exists: those selects are NAMED, and a named select on a column Postgres cannot see is
 * 42703 and fails the WHOLE statement. Here a failure returns an empty map, which is "no event has a
 * type" — today's behaviour for every row in the table.
 */
export async function readEventTypesForTruck(
  supabase: SupabaseClient,
  truckId: string,
  since: string,
): Promise<{ ok: boolean; byEventId: Map<string, EventType> }> {
  const byEventId = new Map<string, EventType>()
  try {
    const [{ data: evs, error: evErr }, { data: types, error: tErr }] = await Promise.all([
      supabase
        .from('truck_events')
        .select('id, event_type_id')
        .eq('truck_id', truckId)
        .gte('event_date', since)
        .not('event_type_id', 'is', null)
        .limit(500),
      supabase.from('event_types').select(TYPE_COLS).eq('truck_id', truckId),
    ])
    if (evErr || tErr) {
      const e = evErr ?? tErr
      console.warn(`[event-types] batch read for truck ${truckId}: ${why((e as { code?: string }).code)}; no types`)
      return { ok: false, byEventId }
    }
    const byTypeId = new Map<string, EventType>()
    for (const t of (types as EventType[] | null) ?? []) byTypeId.set(t.id, t)
    for (const row of (evs as { id: string; event_type_id: string | null }[] | null) ?? []) {
      const t = row.event_type_id ? byTypeId.get(row.event_type_id) : null
      if (t) byEventId.set(row.id, t)
    }
    return { ok: true, byEventId }
  } catch (e) {
    console.warn(`[event-types] batch read threw; no types:`, e instanceof Error ? e.message : String(e))
    return { ok: false, byEventId }
  }
}
