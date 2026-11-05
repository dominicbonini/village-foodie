// lib/weather/run.ts — reviews-weather-1 (5 November 2026): fetching, caching and summarising the forecast for upcoming stops.
// Through a WeatherStore (lib/weather/store.ts against Supabase; in-memory in scripts/reviews-weather-1.cjs).
// ⚠️ OFF: platform_switches.weather_enabled is false, so every call reads that one row and returns { enabled: false }.
//
// The cache is per provider, rounded location (0.01°) and hour/day (weather_hourly). A location is fetched again when its cache
// is older than 24 hours, or 3 hours when one of its stops is today. A failed fetch keeps the old cache: the stop reads `stale`
// (with the old forecast), or `unavailable` when there is none.
import { MAX_DAYS_AHEAD, daysBetween, eventWindow, localDateOf, needsRefresh, roundCoord, summarise, type WeatherPoint, type WeatherProvider, type Summary } from './model'

export type WeatherEvent = {
  eventId: string; truckId: string; eventDate: string; startTime: string | null; endTime: string | null
  /** The stop's own coordinates, else its venue's; null when neither has them. */
  lat: number | null; lng: number | null
  /** The truck's zone (its own, else its country's). */
  tz: string
}
export type EventWeatherRow = {
  eventId: string; truckId: string; provider: string | null
  status: 'ok' | 'stale' | 'unavailable' | 'no_location' | 'too_far'
  resolution: 'hour' | 'day' | null; lat: number | null; lng: number | null; windowStart: string | null; windowEnd: string | null
  tempMinC: number | null; tempMaxC: number | null; precipChanceMax: number | null; windKphMax: number | null; icon: string | null
  hours: Summary['hours']; fetchedAt: string | null
}

export interface WeatherStore {
  enabled(): Promise<boolean>
  /** Stops of every truck (or one) dated from `fromYmd` to `toYmd`, not cancelled, of active non-demo trucks. */
  upcomingEvents(fromYmd: string, toYmd: string, truckId?: string): Promise<WeatherEvent[]>
  cached(provider: string, lat: number, lng: number): Promise<{ points: WeatherPoint[]; fetchedAt: string | null }>
  /** Replaces that location's cache with these points. */
  saveCache(provider: string, lat: number, lng: number, points: WeatherPoint[], fetchedAtIso: string): Promise<void>
  saveEventWeather(row: EventWeatherRow): Promise<void>
  /** The truck's stops whose window has not ended (or has none). */
  eventWeather(truckId: string, nowIso: string): Promise<EventWeatherRow[]>
}

export type RefreshResult = { enabled: boolean; events: number; locations: number; fetched: number; fetchFailed: number; byStatus: Record<string, number> }

const ymdUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export async function refreshWeather(store: WeatherStore, provider: WeatherProvider, opts: { now: () => Date; truckId?: string }): Promise<RefreshResult> {
  const r: RefreshResult = { enabled: false, events: 0, locations: 0, fetched: 0, fetchFailed: 0, byStatus: {} }
  if (!(await store.enabled())) return r
  r.enabled = true
  const nowMs = opts.now().getTime()
  // A UTC day either side covers every zone's "today"; each stop is then judged on its own local date.
  const events = (await store.upcomingEvents(ymdUtc(nowMs - 86_400_000), ymdUtc(nowMs + (MAX_DAYS_AHEAD + 1) * 86_400_000), opts.truckId))
  const save = async (row: EventWeatherRow) => { await store.saveEventWeather(row); r.byStatus[row.status] = (r.byStatus[row.status] ?? 0) + 1 }
  const blank = (e: WeatherEvent, status: EventWeatherRow['status']): EventWeatherRow => ({
    eventId: e.eventId, truckId: e.truckId, provider: null, status, resolution: null, lat: null, lng: null, windowStart: null, windowEnd: null,
    tempMinC: null, tempMaxC: null, precipChanceMax: null, windKphMax: null, icon: null, hours: [], fetchedAt: null,
  })

  type Live = { e: WeatherEvent; win: { startMs: number; endMs: number }; today: boolean; lat: number; lng: number }
  const live: Live[] = []
  for (const e of events) {
    const win = eventWindow(e, e.tz)
    if (win.endMs <= nowMs) continue                                 // over: nothing to forecast
    const ahead = daysBetween(localDateOf(nowMs, e.tz), e.eventDate)
    r.events++
    if (ahead > MAX_DAYS_AHEAD) { await save(blank(e, 'too_far')); continue }
    if (e.lat == null || e.lng == null || !Number.isFinite(e.lat) || !Number.isFinite(e.lng)) { await save(blank(e, 'no_location')); continue }
    live.push({ e, win, today: ahead <= 0, lat: roundCoord(e.lat), lng: roundCoord(e.lng) })
  }

  const byLoc = new Map<string, Live[]>()
  for (const l of live) { const k = `${l.lat},${l.lng}`; byLoc.set(k, [...(byLoc.get(k) ?? []), l]) }
  for (const group of byLoc.values()) {
    r.locations++
    const { lat, lng } = group[0]
    let cache = await store.cached(provider.id, lat, lng)
    let failed = false
    if (needsRefresh(cache.fetchedAt, group.some(g => g.today), nowMs)) {
      try {
        const points = await provider.forecast(lat, lng)
        const at = new Date(nowMs).toISOString()
        await store.saveCache(provider.id, lat, lng, points, at)
        cache = { points, fetchedAt: at }
        r.fetched++
      } catch { failed = true; r.fetchFailed++ }
    }
    for (const g of group) {
      const s = cache.fetchedAt ? summarise(cache.points, g.win, g.e.eventDate, g.e.tz) : null
      if (!s) { await save({ ...blank(g.e, 'unavailable'), provider: provider.id, lat, lng, windowStart: new Date(g.win.startMs).toISOString(), windowEnd: new Date(g.win.endMs).toISOString() }); continue }
      await save({
        eventId: g.e.eventId, truckId: g.e.truckId, provider: provider.id, status: failed ? 'stale' : 'ok', resolution: s.resolution, lat, lng,
        windowStart: new Date(g.win.startMs).toISOString(), windowEnd: new Date(g.win.endMs).toISOString(),
        tempMinC: s.tempMinC, tempMaxC: s.tempMaxC, precipChanceMax: s.precipChanceMax, windKphMax: s.windKphMax, icon: s.icon, hours: s.hours, fetchedAt: cache.fetchedAt,
      })
    }
  }
  return r
}

/** For a future screen: refresh this truck's upcoming stops (within the cache rules), then read them. Null when switched off. */
export async function weatherForTruck(store: WeatherStore, provider: WeatherProvider, truckId: string, now: () => Date):
  Promise<{ attribution: WeatherProvider['attribution']; events: EventWeatherRow[] } | null> {
  const r = await refreshWeather(store, provider, { now, truckId })
  if (!r.enabled) return null
  return { attribution: provider.attribution, events: await store.eventWeather(truckId, now().toISOString()) }
}
