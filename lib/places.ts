// lib/places.ts — town and city lookup for "Where's your truck based?" (Phase 2D-1). SERVER-ONLY.
//
// 🔴 GOOGLE PLACES API (NEW), CALLED FROM THE SERVER ONLY, WITH GOOGLE_MAPS_API_KEY. The key never reaches a
// browser: the browser asks /api/places/suggest and /api/places/details, which call these functions.
//   • autocomplete: restricted to ONE country (the chosen one) and to the place types its ADDRESS FORMAT calls a town
//     (lib/address-formats.ts `places.localityTypes` — GB and the US: locality, postal_town, as before).
//   • session tokens: the browser makes one per search; the suggestions and the pick that ends the search
//     carry the same token, so Google bills them as one session.
//   • details: just what is stored — the name, the county or state, the point, the place id.
// ⚠️ NEVER BLOCKING: no key, a Google error, a timeout or an empty answer all come back as `{ state: 'none' }`.
// The box then accepts free text, which is saved as base_place_name with no coordinates. Signup is never
// stopped by a lookup.
import 'server-only'
import { addressFormatOrDefault, regionOf } from '@/lib/address-formats'

export type Suggestion = { placeId: string; name: string; detail: string }
export type PlaceDetails = {
  placeId: string; name: string; region: string | null; lat: number; lng: number
  /** D22 (Phase 3): the region's code in the format's list ('TX', 'NSW', 'KY') — only for a format whose
   *  `places.regionCode` is set (address-formats-2); the key is absent otherwise, so a GB answer is unchanged. Null
   *  when Places gives none, or one that is not in the list. */
  regionCode?: string | null
}
export type SuggestResult = { state: 'ok'; suggestions: Suggestion[] } | { state: 'none'; reason: string }
export type DetailsResult = { state: 'ok'; place: PlaceDetails } | { state: 'none'; reason: string }

const BASE = 'https://places.googleapis.com/v1'
const TIMEOUT_MS = 4000
type Fetch = typeof fetch

function key(): string | null {
  const k = process.env.GOOGLE_MAPS_API_KEY
  return k && k.trim() ? k.trim() : null
}

async function call(f: Fetch, url: string, init: RequestInit): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await f(url, { ...init, signal: ctl.signal })
    if (!res.ok) throw new Error(`Places ${res.status}`)
    return await res.json()
  } finally { clearTimeout(timer) }
}

/** Towns and cities in one country matching what has been typed. */
export async function suggestTowns(input: string, country: string, sessionToken: string, f: Fetch = fetch, addressFormat?: unknown): Promise<SuggestResult> {
  const k = key()
  if (!k) return { state: 'none', reason: 'no key' }
  const q = input.trim()
  if (q.length < 2) return { state: 'ok', suggestions: [] }
  try {
    const data = await call(f, `${BASE}/places:autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k },
      body: JSON.stringify({
        input: q.slice(0, 100),
        sessionToken,
        includedRegionCodes: [country.toLowerCase()],
        includedPrimaryTypes: [...addressFormatOrDefault(addressFormat).places.localityTypes],
      }),
    }) as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] }
    const suggestions = (data.suggestions ?? []).flatMap(s => {
      const p = s.placePrediction
      if (!p?.placeId) return []
      const name = p.structuredFormat?.mainText?.text ?? p.text?.text ?? ''
      return name ? [{ placeId: p.placeId, name, detail: p.structuredFormat?.secondaryText?.text ?? '' }] : []
    }).slice(0, 5)
    return { state: 'ok', suggestions }
  } catch (e) {
    console.error('[places] autocomplete failed — the box takes free text:', e instanceof Error ? e.message : e)
    return { state: 'none', reason: 'google failed' }
  }
}

/** The details stored for a picked town. The region and its code come from the country's ADDRESS FORMAT
 *  (country_settings.address_format → lib/address-formats.ts `places`): GB the county, the US and Australia the state,
 *  Ireland the county. A key or a legacy value ('postcode' → GB, 'zip_state' → US); anything else → GB. */
export async function townDetails(placeId: string, sessionToken: string, addressFormat: unknown, f: Fetch = fetch): Promise<DetailsResult> {
  const format = addressFormatOrDefault(addressFormat)
  const k = key()
  if (!k) return { state: 'none', reason: 'no key' }
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return { state: 'none', reason: 'bad place id' }
  try {
    const data = await call(f, `${BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`, {
      headers: { 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': 'id,displayName,location,addressComponents' },
    }) as { id?: string; displayName?: { text?: string }; location?: { latitude?: number; longitude?: number }; addressComponents?: { longText?: string; shortText?: string; types?: string[] }[] }
    const lat = data.location?.latitude, lng = data.location?.longitude
    if (typeof lat !== 'number' || typeof lng !== 'number' || !data.displayName?.text) return { state: 'none', reason: 'incomplete answer' }
    const compOf = (t: string) => data.addressComponents?.find(c => c.types?.includes(t))
    // The region: the first of the format's levels that Places gave (GB: the county, else the nation).
    const level = format.places.regionFrom.find(t => compOf(t)?.longText)
    const region = level ? (compOf(level)?.longText ?? null) : null
    // D22: the region's code, kept only when it IS one of the format's list — an unknown region stores nothing.
    // 'exact': Places' short text, exactly a code ("NJ", "NSW"; "nj" is not). 'match': the long or short text looked up.
    const short = level ? (compOf(level)?.shortText ?? null) : null
    const regionCode = format.places.regionCode === 'exact'
      ? (typeof short === 'string' && regionOf(format, short)?.code === short ? short : null)
      : format.places.regionCode === 'match'
        ? (regionOf(format, region)?.code ?? regionOf(format, short)?.code ?? null)
        : null
    return { state: 'ok', place: {
      placeId: data.id ?? placeId, name: data.displayName.text, region, lat: round6(lat), lng: round6(lng),
      ...(format.places.regionCode ? { regionCode } : {}),
    } }
  } catch (e) {
    console.error('[places] details failed — the town is kept as typed:', e instanceof Error ? e.message : e)
    return { state: 'none', reason: 'google failed' }
  }
}

/** numeric(9,6) — six decimals is ~10 cm, far finer than a town needs. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6
