// lib/trade-area.ts — WHERE A TRUCK TRADES: the one check for country, time zone and base town (Phase 2D-1).
// (How far a truck travels is NOT asked — removed 10 October 2026, docs/remove-travel-distance-report.md; a later
// phase makes its own assumption from the base town.) Pure and client-safe: signup (/api/setup), provisioning (lib/provision-truck.ts) and
// Manage › Settings › Where you trade (/api/manage update_trade_area) all run THIS, so the three cannot accept
// different things. Every refusal is a plain sentence a person can act on.
import type { CountrySettings } from '@/lib/country-settings-types'

type CountryFacts = Pick<CountrySettings, 'countryCode' | 'name' | 'enabled' | 'timezones' | 'defaultTimezone'>
  // D22 (Phase 3): a 'zip_state' country also stores the state's code. Optional so the browser's own check
  // (which has no address format) runs unchanged.
  & Partial<Pick<CountrySettings, 'addressFormat'>>

export const TRADE_AREA_ERRORS = {
  noCountry: 'Choose the country your truck is based in.',
  countryOff: (name: string) => `Trucks can't sign up in ${name} yet. Choose another country.`,
  zone: (name: string) => `That time zone isn't one we offer in ${name}. Choose one from the list.`,
  noTown: 'Tell us the town or city you’re based in.',
  townTooLong: 'That town name is too long — 120 characters at most.',
} as const

/** What is stored on the truck. Coordinates and the place id are present only when a suggestion was picked. */
export interface TradeAreaValues {
  timezone: string
  base_place_id: string | null
  base_place_name: string
  base_region: string | null
  base_lat: number | null
  base_lng: number | null
  /** D22 (Phase 3): the state's two-letter code. PRESENT ONLY for a 'zip_state' country, so a GB save
   *  writes exactly the columns it wrote before. Nothing displays it. */
  base_region_code?: string | null
}

const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 1e6) / 1e6 : null
const str = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s && s.length <= max ? s : null
}

/**
 * Check a submitted trade area against the truck's country. `input` uses the stored column names; the
 * zone may be omitted (→ the country's default). A place id, region or point that is malformed is DROPPED,
 * not refused: the town's name is what matters, and a bad point must never cost a signup.
 */
export function checkTradeArea(input: Record<string, unknown>, c: CountryFacts):
  { ok: true; values: TradeAreaValues } | { ok: false; error: string } {
  const zoneIn = typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : c.defaultTimezone
  if (!c.timezones.includes(zoneIn)) return { ok: false, error: TRADE_AREA_ERRORS.zone(c.name) }
  const town = typeof input.base_place_name === 'string' ? input.base_place_name.trim() : ''
  if (!town) return { ok: false, error: TRADE_AREA_ERRORS.noTown }
  if (town.length > 120) return { ok: false, error: TRADE_AREA_ERRORS.townTooLong }
  const placeId = str(input.base_place_id, 300)
  const lat = num(input.base_lat, -90, 90), lng = num(input.base_lng, -180, 180)
  const pointed = placeId && lat !== null && lng !== null
  return {
    ok: true,
    values: {
      timezone: zoneIn,
      base_place_id: pointed ? placeId : null,
      base_place_name: town,
      base_region: pointed ? str(input.base_region, 120) : null,
      base_lat: pointed ? lat : null,
      base_lng: pointed ? lng : null,
      ...(c.addressFormat === 'zip_state' ? {
        base_region_code: pointed && typeof input.base_region_code === 'string' && /^[A-Z]{2}$/.test(input.base_region_code)
          ? input.base_region_code : null,
      } : {}),
    },
  }
}

/** The country check alone — for a signup, before anything else is looked at. */
export function checkSignupCountry(code: unknown, c: CountryFacts | null): string | null {
  if (typeof code !== 'string' || !code.trim() || !c) return TRADE_AREA_ERRORS.noCountry
  if (!c.enabled) return TRADE_AREA_ERRORS.countryOff(c.name)
  return null
}
