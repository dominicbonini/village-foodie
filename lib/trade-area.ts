// lib/trade-area.ts — WHERE A TRUCK TRADES: the one check for country, time zone and base town (Phase 2D-1).
// (How far a truck travels is NOT asked — removed 10 October 2026, docs/remove-travel-distance-report.md; a later
// phase makes its own assumption from the base town.) Pure and client-safe: signup (/api/setup), provisioning (lib/provision-truck.ts) and
// Manage › Settings › Where you trade (/api/manage update_trade_area) all run THIS, so the three cannot accept
// different things. Every refusal is a plain sentence a person can act on.
// 🔴 A REFUSAL IS A CODE AND ITS VALUES (Language Phase 1d), never words: `{ code, params }`, whose sentence is the
// `tradeArea` namespace's message (messages/en-GB.json) — read by each caller in its own language: the routes through
// `tradeAreaErrorBody` (lib/i18n/manage-errors.ts), provisioning through `translatorFor`, the signup step through `useT`.
import { addressFormatOf, regionOf } from '@/lib/address-formats'
import type { CountrySettings } from '@/lib/country-settings-types'

type CountryFacts = Pick<CountrySettings, 'countryCode' | 'name' | 'enabled' | 'timezones' | 'defaultTimezone'>
  // D22 (Phase 3): a country whose address format keeps a Places region code (the US, Australia, Ireland, Canada —
  // lib/address-formats.ts `places.regionCode`) also stores it. Optional so the browser's own check (which has no
  // address format) runs unchanged.
  & Partial<Pick<CountrySettings, 'addressFormat'>>

/** A refusal: a `tradeArea` message key and its values (the country's name, already as the settings row writes it). */
export type TradeAreaCode = 'country_missing' | 'country_off' | 'zone_unknown' | 'town_missing' | 'town_too_long'
export interface TradeAreaRefusal { code: TradeAreaCode; params: Record<string, string> }

export const TRADE_AREA_ERRORS = {
  noCountry: { code: 'country_missing', params: {} } as TradeAreaRefusal,
  countryOff: (name: string): TradeAreaRefusal => ({ code: 'country_off', params: { country: name } }),
  zone: (name: string): TradeAreaRefusal => ({ code: 'zone_unknown', params: { country: name } }),
  noTown: { code: 'town_missing', params: {} } as TradeAreaRefusal,
  townTooLong: { code: 'town_too_long', params: {} } as TradeAreaRefusal,
} as const

/** What is stored on the truck. Coordinates and the place id are present only when a suggestion was picked. */
export interface TradeAreaValues {
  timezone: string
  base_place_id: string | null
  base_place_name: string
  base_region: string | null
  base_lat: number | null
  base_lng: number | null
  /** D22 (Phase 3): the region's code ("NJ", "NSW", "KY"). PRESENT ONLY for a format that keeps one, so a GB save
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
  { ok: true; values: TradeAreaValues } | ({ ok: false } & TradeAreaRefusal) {
  const zoneIn = typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : c.defaultTimezone
  if (!c.timezones.includes(zoneIn)) return { ok: false, ...TRADE_AREA_ERRORS.zone(c.name) }
  const town = typeof input.base_place_name === 'string' ? input.base_place_name.trim() : ''
  if (!town) return { ok: false, ...TRADE_AREA_ERRORS.noTown }
  if (town.length > 120) return { ok: false, ...TRADE_AREA_ERRORS.townTooLong }
  const placeId = str(input.base_place_id, 300)
  const lat = num(input.base_lat, -90, 90), lng = num(input.base_lng, -180, 180)
  const pointed = placeId && lat !== null && lng !== null
  // 🔴 address-formats-2 (21 October 2026): THE CODE IS CHECKED HERE, AGAINST THE FORMAT'S OWN LIST, EXACTLY ("NJ", "NSW";
  // never "nj") — this replaces the database's two-letter CHECK (trucks_base_region_code_chk, dropped by
  // 20261030_address_suburb_region.sql), which could not hold Australia's "NSW" or Ireland's "D".
  const fmt = addressFormatOf(c.addressFormat)
  const regionCodeFormat = fmt?.places.regionCode && fmt.regions ? fmt : null
  return {
    ok: true,
    values: {
      timezone: zoneIn,
      base_place_id: pointed ? placeId : null,
      base_place_name: town,
      base_region: pointed ? str(input.base_region, 120) : null,
      base_lat: pointed ? lat : null,
      base_lng: pointed ? lng : null,
      ...(regionCodeFormat ? {
        base_region_code: pointed && typeof input.base_region_code === 'string' && regionOf(regionCodeFormat, input.base_region_code)?.code === input.base_region_code
          ? input.base_region_code : null,
      } : {}),
    },
  }
}

/** ⚠️ UNTIL 20261030_address_suburb_region.sql IS RUN, the database's CHECK (trucks_base_region_code_chk) holds
 *  base_region_code to two capital letters. A code from the format's list that it would refuse — Australia's "NSW",
 *  Ireland's "D" — is therefore written AFTER the main write, in its own update that fails alone (logged), so a save or
 *  a signup never fails on it. Every US code is two letters, so a US write is exactly what it was (no second update). */
export const LEGACY_REGION_CODE = /^[A-Z]{2}$/
export function splitRegionCodeWrite<T extends { base_region_code?: string | null }>(v: T): { main: T; after: string | null } {
  if (typeof v.base_region_code === 'string' && !LEGACY_REGION_CODE.test(v.base_region_code)) return { main: { ...v, base_region_code: null }, after: v.base_region_code }
  return { main: v, after: null }
}

/** The country check alone — for a signup, before anything else is looked at. */
export function checkSignupCountry(code: unknown, c: CountryFacts | null): TradeAreaRefusal | null {
  if (typeof code !== 'string' || !code.trim() || !c) return TRADE_AREA_ERRORS.noCountry
  if (!c.enabled) return TRADE_AREA_ERRORS.countryOff(c.name)
  return null
}
