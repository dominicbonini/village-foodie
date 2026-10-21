// lib/event-region-read.ts — the events' states (truck_events.region), read on their own and best-effort.
// 🔴 A SEPARATE READ, NEVER A COLUMN IN ANOTHER SELECT. The order, promotion, dashboard and feed selects name their
// columns, and until 20261019_truck_events_region.sql is applied a select naming `region` fails whole (42703) — on a
// money path that would fail an order. This read fails alone: any error, or the column missing, is "no states", and
// every line then reads exactly as it did before (lib/event-address.ts).
import type { SupabaseClient } from '@supabase/supabase-js'
import { normaliseRegion } from '@/lib/event-address'

// address-formats-1 (21 October 2026): with the truck's address format (one for every event, or one per event), a
// region is kept when it is in THAT format's region list, as its code ("nsw" → "NSW", "Kerry" → "KY") — so Australian
// states and Irish counties reach the line. With no format, the old rule (two letters, upper-cased), unchanged.
export async function readEventRegions(supabase: SupabaseClient, eventIds: (string | null | undefined)[], format?: unknown): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = Array.from(new Set(eventIds.filter((x): x is string => !!x)))
  if (!ids.length) return out
  try {
    const { data, error } = await supabase.from('truck_events').select('id, region').in('id', ids)
    if (error) return out
    for (const r of (data || []) as { id: string; region?: unknown }[]) {
      const region = normaliseRegion(r.region, typeof format === 'function' ? (format as (id: string) => unknown)(r.id) : format)
      if (region) out.set(r.id, region)
    }
  } catch {
    // no states — the lines read as before
  }
  return out
}

export async function readEventRegion(supabase: SupabaseClient, eventId: string | null | undefined, format?: unknown): Promise<string | null> {
  return eventId ? (await readEventRegions(supabase, [eventId], format)).get(eventId) ?? null : null
}
