// lib/weather/openweather.ts — reviews-weather-1 (5 November 2026): the one WeatherProvider, OpenWeather's One Call API 3.0.
// WHY NOT APPLE WEATHERKIT (the brief's preference): its licence (Apple Developer Program License Agreement, Attachment 8 §1.6)
// says "Apple Weather Data may not be cached, pre-fetched, or stored … other than on a temporary and limited basis solely to
// improve the performance of the WeatherKit APIs", and this design stores a forecast per location and hour and on each stop;
// §1.2 also bars charging users for the data in its original form. OpenWeather's self-service plans state "Commercial use is
// allowed" (ODbL), the first 1,000 calls a day are free and each further call is 0.0012 GBP; it asks for visible attribution
// ("Weather data © OpenWeather"). docs/reviews-weather-1-report.md §3.
// Key: OPENWEATHER_API_KEY (server only). Without it the provider throws 'no_key' and every stop reads `unavailable`.
import type { WeatherIcon, WeatherPoint, WeatherProvider } from './model'

const ENDPOINT = 'https://api.openweathermap.org/data/3.0/onecall'

/** OpenWeather condition ids (openweathermap.org/weather-conditions) → our codes. */
export function iconFromOpenWeather(id: unknown): WeatherIcon {
  const n = typeof id === 'number' ? id : Number(id)
  if (!Number.isFinite(n)) return 'unknown'
  if (n >= 200 && n < 300) return 'thunderstorm'
  if (n >= 300 && n < 400) return 'drizzle'
  if (n === 511 || (n >= 611 && n <= 616)) return 'sleet'
  if ([502, 503, 504, 522, 531].includes(n)) return 'heavy_rain'
  if (n >= 500 && n < 600) return 'rain'
  if (n >= 600 && n < 700) return 'snow'
  if (n === 771 || n === 781) return 'wind'
  if (n >= 700 && n < 800) return 'fog'
  if (n === 800) return 'clear'
  if (n === 801 || n === 802) return 'partly_cloudy'
  if (n === 803 || n === 804) return 'cloudy'
  return 'unknown'
}

const num = (v: unknown, dp = 1): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** dp) / 10 ** dp : null)
const pct = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v * 100))) : null)
/** units=metric gives wind in metres a second. */
const kph = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 3.6 * 10) / 10 : null)
const iso = (unix: unknown): string | null => (typeof unix === 'number' && Number.isFinite(unix) ? new Date(unix * 1000).toISOString() : null)
type OwPoint = { dt?: unknown; temp?: unknown; pop?: unknown; wind_speed?: unknown; weather?: { id?: unknown }[] }

/** A One Call 3.0 answer → points (hourly + daily). Anything malformed is left out, never guessed. */
export function parseOneCall(body: unknown): WeatherPoint[] {
  const b = (body ?? {}) as { hourly?: OwPoint[]; daily?: OwPoint[] }
  const out: WeatherPoint[] = []
  for (const h of Array.isArray(b.hourly) ? b.hourly : []) {
    const t = iso(h.dt); if (!t) continue
    out.push({ kind: 'hour', timeUtc: t, temperatureC: num(h.temp), tempMinC: null, tempMaxC: null, precipChance: pct(h.pop), windKph: kph(h.wind_speed), icon: iconFromOpenWeather(h.weather?.[0]?.id) })
  }
  for (const d of Array.isArray(b.daily) ? b.daily : []) {
    const t = iso(d.dt); if (!t) continue
    const temp = (d.temp ?? {}) as { min?: unknown; max?: unknown; day?: unknown }
    out.push({ kind: 'day', timeUtc: t, temperatureC: num(temp.day), tempMinC: num(temp.min), tempMaxC: num(temp.max), precipChance: pct(d.pop), windKph: kph(d.wind_speed), icon: iconFromOpenWeather(d.weather?.[0]?.id) })
  }
  return out
}

export function openWeatherProvider(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): WeatherProvider {
  return {
    id: 'openweather',
    attribution: { text: 'Weather data © OpenWeather', url: 'https://openweathermap.org/' },
    async forecast(lat, lng) {
      if (!apiKey) throw new Error('no_key')
      const q = new URLSearchParams({ lat: String(lat), lon: String(lng), exclude: 'current,minutely,alerts', units: 'metric', appid: apiKey })
      const res = await fetchImpl(`${ENDPOINT}?${q}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`openweather_${res.status}`)
      const points = parseOneCall(await res.json())
      if (!points.length) throw new Error('openweather_empty')
      return points
    },
  }
}

/** The provider in use: OpenWeather with OPENWEATHER_API_KEY (absent → every fetch throws 'no_key'). */
export const weatherProvider = (): WeatherProvider => openWeatherProvider(process.env.OPENWEATHER_API_KEY)
