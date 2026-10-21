// lib/schedule-context.ts — the truck context the operator importer's prompt is given (Phase 2D-2 Part A,
// docs/schedules-country-report.md). SERVER-ONLY: reads the truck's country settings and its events.
//
// The importer (lib/schedule-extract.ts) is told the truck's name, its base town and region (Phase 2D-1
// trucks.base_place_name / base_region), its country's name, and the distinct towns of its last 15 confirmed
// events — the Apps Script vendor-email prompt's pattern of showing the model where a truck already trades.
// Its location lines follow the country's address_format. A read that fails leaves its line out; it never
// blocks an import.
import { messagesStyleOf } from '@/lib/address-formats'
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCountrySettings } from '@/lib/country-settings'
import type { ScheduleContext } from '@/lib/schedule-extract'

export const RECENT_EVENTS_FOR_CONTEXT = 15
/** The statuses an operator has confirmed (live, or done). Unconfirmed scraped finds are not evidence. */
const CONFIRMED = ['confirmed', 'open', 'closed']

export async function scheduleContextForTruck(
  supabase: SupabaseClient,
  truck: { id: string; name?: string | null; country?: string | null; base_place_name?: string | null; base_region?: string | null },
): Promise<ScheduleContext> {
  let countryName: string | null = null
  let countryCode: string | null = null
  let addressFormat: ScheduleContext['addressFormat'] = 'postcode'
  try {
    const s = await getCountrySettings(truck.country || 'GB')
    countryName = s.name
    countryCode = s.countryCode
    addressFormat = messagesStyleOf(s.addressFormat)   // address-formats-1: the prompt's style, unchanged until stage 2
  } catch (e) {
    console.warn('[schedule-context] country settings unavailable:', e instanceof Error ? e.message : String(e))
  }
  let recentTowns: string[] = []
  try {
    const { data } = await supabase.from('truck_events')
      .select('town, event_date')
      .eq('truck_id', truck.id)
      .in('status', CONFIRMED)
      .order('event_date', { ascending: false })
      .limit(RECENT_EVENTS_FOR_CONTEXT)
    const seen = new Set<string>()
    for (const r of (data ?? []) as { town: string | null }[]) {
      const t = (r.town ?? '').trim()
      if (!t || seen.has(t.toLowerCase())) continue
      seen.add(t.toLowerCase()); recentTowns.push(t)
    }
  } catch (e) {
    console.warn('[schedule-context] recent events unavailable:', e instanceof Error ? e.message : String(e))
    recentTowns = []
  }
  return {
    truckName: truck.name ?? null,
    baseTown: truck.base_place_name ?? null,
    baseRegion: truck.base_region ?? null,
    countryName,
    countryCode,
    addressFormat,
    recentTowns,
  }
}
