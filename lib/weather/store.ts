// lib/weather/store.ts — reviews-weather-1 (5 November 2026): the WeatherStore (lib/weather/run.ts) over Supabase, service role.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'
import { truckTimeZone } from '@/lib/truck-time'
import type { WeatherPoint, WeatherIcon } from './model'
import type { WeatherStore, WeatherEvent, EventWeatherRow } from './run'

type Row = Record<string, unknown>
const n = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const s = (v: unknown) => (typeof v === 'string' ? v : null)

export function supabaseWeatherStore(db: SupabaseClient): WeatherStore {
  return {
    async enabled() {
      const { data } = await db.from('platform_switches').select('weather_enabled').eq('id', true).maybeSingle()
      return (data as Row | null)?.weather_enabled === true
    },
    async upcomingEvents(fromYmd, toYmd, truckId) {
      let q = db.from('truck_events').select('id, truck_id, event_date, start_time, end_time, latitude, longitude, venue_id, status')
        .gte('event_date', fromYmd).lte('event_date', toYmd).neq('status', 'cancelled')
      if (truckId) q = q.eq('truck_id', truckId)
      const { data: events } = await q
      const list = ((events ?? []) as Row[]).filter(e => !isDemoIdentifier(String(e.truck_id)))
      if (!list.length) return []
      const truckIds = [...new Set(list.map(e => String(e.truck_id)))]
      const venueIds = [...new Set(list.map(e => s(e.venue_id)).filter((x): x is string => !!x))]
      const [{ data: trucks }, { data: venues }] = await Promise.all([
        db.from('trucks').select('id, timezone, country, is_active, active').in('id', truckIds),
        venueIds.length ? db.from('venues').select('id, latitude, longitude').in('id', venueIds) : Promise.resolve({ data: [] as Row[] }),
      ])
      const tz = new Map<string, string>()
      for (const t of (trucks ?? []) as Row[]) {
        if (t.is_active === false || t.active === false) continue
        tz.set(String(t.id), await truckTimeZone({ timezone: s(t.timezone), country: s(t.country) }))
      }
      const venue = new Map(((venues ?? []) as Row[]).map(v => [String(v.id), v]))
      const out: WeatherEvent[] = []
      for (const e of list) {
        const zone = tz.get(String(e.truck_id)); if (!zone) continue
        const v = e.venue_id ? venue.get(String(e.venue_id)) : undefined
        const lat = n(e.latitude) ?? n(v?.latitude), lng = n(e.longitude) ?? n(v?.longitude)
        out.push({ eventId: String(e.id), truckId: String(e.truck_id), eventDate: String(e.event_date), startTime: s(e.start_time), endTime: s(e.end_time), lat: lat != null && lng != null ? lat : null, lng: lat != null && lng != null ? lng : null, tz: zone })
      }
      return out
    },
    async cached(provider, lat, lng) {
      const { data } = await db.from('weather_hourly').select('*').eq('provider', provider).eq('lat', lat).eq('lng', lng)
      const rows = (data ?? []) as Row[]
      const points: WeatherPoint[] = rows.map(r => ({
        kind: r.kind === 'day' ? 'day' : 'hour', timeUtc: new Date(String(r.time_utc)).toISOString(), temperatureC: n(r.temperature_c), tempMinC: n(r.temp_min_c),
        tempMaxC: n(r.temp_max_c), precipChance: n(r.precip_chance), windKph: n(r.wind_kph), icon: (s(r.icon) ?? 'unknown') as WeatherIcon,
      }))
      const fetchedAt = rows.reduce<string | null>((a, r) => { const f = s(r.fetched_at); return f && (!a || f > a) ? f : a }, null)
      return { points, fetchedAt }
    },
    async saveCache(provider, lat, lng, points, fetchedAtIso) {
      await db.from('weather_hourly').delete().eq('provider', provider).eq('lat', lat).eq('lng', lng)
      if (!points.length) return
      await db.from('weather_hourly').insert(points.map(p => ({
        provider, lat, lng, kind: p.kind, time_utc: p.timeUtc, temperature_c: p.temperatureC, temp_min_c: p.tempMinC, temp_max_c: p.tempMaxC,
        precip_chance: p.precipChance, wind_kph: p.windKph, icon: p.icon, fetched_at: fetchedAtIso,
      })))
    },
    async saveEventWeather(r) {
      await db.from('event_weather').upsert({
        event_id: r.eventId, truck_id: r.truckId, provider: r.provider, status: r.status, resolution: r.resolution, lat: r.lat, lng: r.lng,
        window_start: r.windowStart, window_end: r.windowEnd, temp_min_c: r.tempMinC, temp_max_c: r.tempMaxC, precip_chance_max: r.precipChanceMax,
        wind_kph_max: r.windKphMax, icon: r.icon, hours: r.hours, fetched_at: r.fetchedAt, updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id' })
    },
    async eventWeather(truckId, nowIso) {
      const { data } = await db.from('event_weather').select('*').eq('truck_id', truckId)
      return ((data ?? []) as Row[]).filter(r => !r.window_end || String(r.window_end) >= nowIso || new Date(String(r.window_end)).toISOString() >= nowIso).map(r => ({
        eventId: String(r.event_id), truckId: String(r.truck_id), provider: s(r.provider), status: r.status as EventWeatherRow['status'],
        resolution: (s(r.resolution) as EventWeatherRow['resolution']) ?? null, lat: n(r.lat), lng: n(r.lng), windowStart: s(r.window_start), windowEnd: s(r.window_end),
        tempMinC: n(r.temp_min_c), tempMaxC: n(r.temp_max_c), precipChanceMax: n(r.precip_chance_max), windKphMax: n(r.wind_kph_max), icon: s(r.icon),
        hours: Array.isArray(r.hours) ? (r.hours as EventWeatherRow['hours']) : [], fetchedAt: s(r.fetched_at),
      }))
    },
  }
}
