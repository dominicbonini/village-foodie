// lib/visitor-country.ts — WHICH COUNTRY'S PRICES A MARKETING PAGE SHOWS THIS VISITOR (Phase 2D-1). SERVER-ONLY.
//
// The landing page, /features, /compare and the plans PDF quote one country's prices. Which one, in order:
//   1. ?country=XX on the URL          (and the menu then keeps it in the hg_country cookie)
//   2. the hg_country cookie           (the visitor's own earlier choice)
//   3. x-vercel-ip-country             (where the request comes from)
//   4. MARKETING_COUNTRY               (GB)
// 🔴 A COUNTRY IS USED ONLY IF IT IS SWITCHED ON (country_settings.enabled). Anything else falls through to the
// next source, so a stale cookie or a visitor from a country that is not open sees the UK page.
// Resolved on the server, per request — the pages are force-dynamic and read the request, so nothing is cached
// across countries and the first paint already carries the right prices.
import 'server-only'
import { cookies, headers } from 'next/headers'
import { listCountrySettingsCached } from '@/lib/country-settings'
import type { CountrySettings } from '@/lib/country-settings-types'
import { flagDataUri } from '@/lib/flags'
import { MARKETING_COUNTRY } from '@/lib/marketing-country'
import { VISITOR_COUNTRY_COOKIE, type VisitorCountryMenu, type VisitorCountryOption } from '@/lib/visitor-country-types'

export interface VisitorCountry { settings: CountrySettings; menu: VisitorCountryMenu }

const code = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '')

/** Pure: pick the country from the four sources, given the switched-on list. Exported for the harness. */
export function pickVisitorCountry(enabledCodes: string[], src: { query?: unknown; cookie?: unknown; ip?: unknown }):
  { code: string; fromQuery: boolean } {
  const on = (c: string) => !!c && enabledCodes.includes(c)
  const q = code(src.query); if (on(q)) return { code: q, fromQuery: true }
  const k = code(src.cookie); if (on(k)) return { code: k, fromQuery: false }
  const ip = code(src.ip); if (on(ip)) return { code: ip, fromQuery: false }
  return { code: MARKETING_COUNTRY, fromQuery: false }
}

const optionOf = (c: CountrySettings): VisitorCountryOption =>
  ({ code: c.countryCode, name: c.name, shortName: c.shortName ?? c.name, flag: flagDataUri(c.countryCode) })

/**
 * The visitor's country for this request. `query` is the page's ?country value (pages pass their searchParams;
 * a route handler passes the URL's). The menu lists switched-on countries only; `remember` is set when the URL
 * chose, so the menu writes the cookie and the choice sticks.
 */
export async function resolveVisitorCountry(query?: string | string[] | null): Promise<VisitorCountry> {
  const all = await listCountrySettingsCached()
  const enabled = all.filter(c => c.enabled)
  const [h, k] = await Promise.all([headers(), cookies()])
  const picked = pickVisitorCountry(enabled.map(c => c.countryCode), {
    query: Array.isArray(query) ? query[0] : query,
    cookie: k.get(VISITOR_COUNTRY_COOKIE)?.value,
    ip: h.get('x-vercel-ip-country'),
  })
  // 🔴 The marketing country is the floor even if it were ever switched off: a page with prices must have a row.
  const settings = all.find(c => c.countryCode === picked.code) ?? all.find(c => c.countryCode === MARKETING_COUNTRY)
  if (!settings) throw new Error(`[visitor-country] no country_settings row for ${picked.code} or ${MARKETING_COUNTRY}`)
  const options = (enabled.some(c => c.countryCode === settings.countryCode) ? enabled : [settings, ...enabled]).map(optionOf)
  return {
    settings,
    menu: { current: optionOf(settings), options, remember: picked.fromQuery ? settings.countryCode : null },
  }
}

/**
 * The visitor's country CODE for a ROUTE HANDLER (Language Phase 2: the landing page's demo, /api/demo) — the same
 * sources and the same switched-on rule as `resolveVisitorCountry`, read off the request itself (its URL's ?country,
 * the hg_country cookie, x-vercel-ip-country). 🔴 NEVER THROWS: a country list that cannot be read is the marketing
 * country (GB), so a visitor is never refused a demo over it. While the US is switched off this is always GB.
 */
export async function visitorCountryCodeOf(req: {
  nextUrl: { searchParams: URLSearchParams }
  cookies: { get(name: string): { value: string } | undefined }
  headers: { get(name: string): string | null }
}): Promise<string> {
  try {
    const all = await listCountrySettingsCached()
    return pickVisitorCountry(all.filter(c => c.enabled).map(c => c.countryCode), {
      query: req.nextUrl.searchParams.get('country'),
      cookie: req.cookies.get(VISITOR_COUNTRY_COOKIE)?.value,
      ip: req.headers.get('x-vercel-ip-country'),
    }).code
  } catch {
    return MARKETING_COUNTRY
  }
}
