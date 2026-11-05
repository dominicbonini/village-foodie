// lib/weather/model.ts — reviews-weather-1 (5 November 2026, docs/reviews-weather-1-report.md): weather per stop, the RULES.
// Pure: no database, no network; every "now" is a parameter. lib/weather/run.ts applies them; the harness proves them.

/** Provider-neutral condition codes (a future screen maps each to its own icon). */
export const WEATHER_ICONS = ['clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm', 'wind', 'unknown'] as const
export type WeatherIcon = typeof WEATHER_ICONS[number]
/** Most severe first: a tie between two conditions shows the worse one. */
const SEVERITY: WeatherIcon[] = ['thunderstorm', 'snow', 'sleet', 'heavy_rain', 'rain', 'drizzle', 'wind', 'fog', 'cloudy', 'partly_cloudy', 'clear', 'unknown']

/** One forecast point: an hour (`timeUtc` = the hour's start) or a day (`timeUtc` = the provider's time for that day). */
export type WeatherPoint = {
  kind: 'hour' | 'day'
  timeUtc: string
  temperatureC: number | null
  tempMinC: number | null
  tempMaxC: number | null
  /** 0–100 */
  precipChance: number | null
  windKph: number | null
  icon: WeatherIcon
}

export interface WeatherProvider {
  readonly id: string
  /** Shown wherever the data is shown (the provider's licence requires it). */
  readonly attribution: { text: string; url: string }
  /** The forecast for a location: hourly for the next ~48 hours, daily for the next ~8 days. Throws when unavailable. */
  forecast(lat: number, lng: number): Promise<WeatherPoint[]>
}

/** Stops further ahead than this are not fetched (the daily forecast covers today + 7). */
export const MAX_DAYS_AHEAD = 7
/** A location's cache is refreshed when older than this… */
export const REFRESH_HOURS = 24
/** …or than this when one of its stops is today (the stop's own local date). */
export const REFRESH_HOURS_ON_THE_DAY = 3
/** A stop with no start or end time: this local window. */
export const DEFAULT_WINDOW = { start: '10:00', end: '16:00' }

/** 0.01° (about 1 km): stops at the same place share one cache entry. */
export const roundCoord = (x: number) => Math.round(x * 100) / 100

/** The local calendar date (YYYY-MM-DD) of an instant in a zone. */
export function localDateOf(ms: number, tz: string): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

/** The instant of a local wall time in a zone (correct away from the DST jump itself). */
export function instantOf(ymd: string, hhmm: string, tz: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0)
  const offset = (t: number) => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t))
    const g = (k: string) => Number(p.find(x => x.type === k)?.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - t
  }
  const guess = wall - offset(wall)
  return wall - offset(guess)
}

export const daysBetween = (fromYmd: string, toYmd: string) => Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000)

/** A stop's trading window as instants: its start and end times in the truck's zone (an end at or before the start runs past
 *  midnight); with no times, DEFAULT_WINDOW. */
export function eventWindow(e: { eventDate: string; startTime: string | null; endTime: string | null }, tz: string): { startMs: number; endMs: number; timesKnown: boolean } {
  const hm = (t: string | null) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5) : null)
  const s = hm(e.startTime), en = hm(e.endTime)
  const timesKnown = !!(s && en)
  const startMs = instantOf(e.eventDate, s ?? DEFAULT_WINDOW.start, tz)
  let endMs = instantOf(e.eventDate, en ?? DEFAULT_WINDOW.end, tz)
  if (endMs <= startMs) endMs += 86_400_000
  return { startMs, endMs, timesKnown }
}

/** Should a location's cache be fetched again? */
export function needsRefresh(fetchedAtIso: string | null, anyStopToday: boolean, nowMs: number): boolean {
  if (!fetchedAtIso) return true
  const age = nowMs - Date.parse(fetchedAtIso)
  return age > (anyStopToday ? REFRESH_HOURS_ON_THE_DAY : REFRESH_HOURS) * 3_600_000
}

export type Summary = {
  resolution: 'hour' | 'day'
  tempMinC: number | null
  tempMaxC: number | null
  precipChanceMax: number | null
  windKphMax: number | null
  icon: WeatherIcon
  hours: { timeUtc: string; temperatureC: number | null; precipChance: number | null; windKph: number | null; icon: WeatherIcon }[]
}

const max = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.max(...v) : null }
const min = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.min(...v) : null }
/** The most frequent condition; a tie shows the more severe. */
export function iconOf(icons: WeatherIcon[]): WeatherIcon {
  if (!icons.length) return 'unknown'
  const n = new Map<WeatherIcon, number>(); icons.forEach(i => n.set(i, (n.get(i) ?? 0) + 1))
  return [...n.entries()].sort((a, b) => b[1] - a[1] || SEVERITY.indexOf(a[0]) - SEVERITY.indexOf(b[0]))[0][0]
}

/** The forecast for a stop's window: the hours, when every hour of the window is in the cache; otherwise that local day's
 *  point; otherwise null (unavailable). */
export function summarise(points: WeatherPoint[], win: { startMs: number; endMs: number }, eventDate: string, tz: string): Summary | null {
  const firstHour = Math.floor(win.startMs / 3_600_000) * 3_600_000
  const want: number[] = []
  for (let t = firstHour; t < win.endMs; t += 3_600_000) want.push(t)
  const byHour = new Map(points.filter(p => p.kind === 'hour').map(p => [Date.parse(p.timeUtc), p]))
  if (want.length && want.every(t => byHour.has(t))) {
    const hs = want.map(t => byHour.get(t)!)
    return {
      resolution: 'hour', tempMinC: min(hs.map(h => h.temperatureC)), tempMaxC: max(hs.map(h => h.temperatureC)),
      precipChanceMax: max(hs.map(h => h.precipChance)), windKphMax: max(hs.map(h => h.windKph)), icon: iconOf(hs.map(h => h.icon)),
      hours: hs.map(h => ({ timeUtc: h.timeUtc, temperatureC: h.temperatureC, precipChance: h.precipChance, windKph: h.windKph, icon: h.icon })),
    }
  }
  const day = points.find(p => p.kind === 'day' && localDateOf(Date.parse(p.timeUtc), tz) === eventDate)
  if (!day) return null
  return { resolution: 'day', tempMinC: day.tempMinC, tempMaxC: day.tempMaxC, precipChanceMax: day.precipChance, windKphMax: day.windKph, icon: day.icon, hours: [] }
}
