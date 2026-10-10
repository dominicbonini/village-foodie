// lib/truck-time.ts — A TRUCK'S TIME ZONE, AND HOW ITS TIMES AND DATES LOOK. Server-only, loader-backed.
//
// ══ 🔴 THE ONE RULE (Phase 2B) ═════════════════════════════════════════════════════════════════════════════
//     truck time zone = trucks.timezone, else its country's default_timezone (country_settings)
// and the display settings (locale, time_format, date_order, week_start) are its country's. Every server
// path that decides "now" or "today" for a truck asks THIS, and every browser gets the result as a
// `TimeSettings` in a payload it already receives. Nothing anywhere names a zone as a truck's default.
//
// ⚠️ LOUD, LIKE THE LOADER: a truck with no `country` (left out of a select) throws rather than guessing.
// A route that feeds a kitchen (the dashboard) catches that and sends no settings, and the screen then
// uses the UK's (lib/time-utils `timeSettingsOr`), because every truck that predates this build is a UK
// truck — the one documented fallback.
import 'server-only'
import { getCountrySettings, countrySettingsForTruck } from '@/lib/country-settings'
import type { TimeSettings } from '@/lib/time-utils'

type TruckLike = { timezone?: string | null; country?: string | null } | null | undefined

function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}

/** The truck's settings: its own zone if it has a valid one, else its country's default. */
export async function truckTimeSettings(truck: TruckLike): Promise<TimeSettings> {
  const c = await countrySettingsForTruck(truck)
  const own = truck?.timezone
  if (own && !validZone(own)) console.error(`[truck-time] trucks.timezone "${own}" is not a zone this runtime knows — using ${c.countryCode}'s default`)
  return {
    timeZone: validZone(own) ? own : c.defaultTimezone,
    locale: c.locale,
    timeFormat: c.timeFormat === '12h' ? '12h' : '24h',
    dateOrder: c.dateOrder === 'mdy' ? 'mdy' : 'dmy',
    weekStart: c.weekStart === 'sunday' ? 'sunday' : 'monday',
  }
}

/** Just the zone — the truck's wall clock for every "now" and "today" decision. */
export async function truckTimeZone(truck: TruckLike): Promise<string> {
  return (await truckTimeSettings(truck)).timeZone
}

/** A country's settings with no truck — for a page that only knows the country (e.g. the marketing one). */
export async function countryTimeSettings(code: string): Promise<TimeSettings> {
  const c = await getCountrySettings(code)
  return {
    timeZone: c.defaultTimezone, locale: c.locale,
    timeFormat: c.timeFormat === '12h' ? '12h' : '24h', dateOrder: c.dateOrder === 'mdy' ? 'mdy' : 'dmy', weekStart: c.weekStart === 'sunday' ? 'sunday' : 'monday',
  }
}
