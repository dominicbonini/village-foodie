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
// 🔴 LANGUAGE PHASE 1e: on a HatchGrab host the marketing pages live at COUNTRY ADDRESSES (/uk, /us/features, …), and
// there the country is the ADDRESS's (resolveCountryPage below) — the four sources above are applied ONE step earlier,
// by proxy.ts's router, which sends the visitor to their country's address (the same rule: pickMarketingCountry in
// lib/marketing-country.ts). The four-source path here still serves any render without a country address (the
// unlisted preview on another host, the plans PDF route) exactly as before.
import 'server-only'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { listCountrySettingsCached } from '@/lib/country-settings'
import type { CountrySettings } from '@/lib/country-settings-types'
import { flagDataUri } from '@/lib/flags'
import { isHatchGrabHost } from '@/lib/brand'
import {
  MARKETING_COUNTRY, COUNTRY_PATH_SEGMENTS, countryOfSegment, countryPagePath, pickMarketingCountry, type MarketingPage,
} from '@/lib/marketing-country'
import { VISITOR_COUNTRY_COOKIE, type VisitorCountryMenu, type VisitorCountryOption } from '@/lib/visitor-country-types'

export interface VisitorCountry {
  settings: CountrySettings
  menu: VisitorCountryMenu
  /** Where the page's own links to the three marketing pages go (Language Phase 1e). On a COUNTRY page they are that
   *  country's addresses ('/uk', '/uk/features', '/uk/compare'); otherwise the literals the pages carried before
   *  ('/landing', '/features', '/compare'), byte-identical. */
  paths: Record<MarketingPage, string>
  /** Set on a COUNTRY page only: every switched-on country that has an address, with its locale — the hreflang set
   *  (lib/marketing-meta.ts countryPageAlternates). Null on the un-prefixed addresses. */
  countryPage: { alternates: { code: string; locale: string }[] } | null
}

/** Pure: pick the country from the four sources, given the switched-on list. Exported for the harness.
 *  🔴 The rule itself lives in lib/marketing-country.ts (pickMarketingCountry), so proxy.ts's router — which cannot
 *  import this server module's request helpers — applies the SAME rule, not a copy. */
export const pickVisitorCountry = pickMarketingCountry

const optionOf = (c: CountrySettings): VisitorCountryOption =>
  ({ code: c.countryCode, name: c.name, shortName: c.shortName ?? c.name, flag: flagDataUri(c.countryCode) })

/**
 * The visitor's country for this request. `query` is the page's ?country value (pages pass their searchParams;
 * a route handler passes the URL's). The menu lists switched-on countries only; `remember` is set when the URL
 * chose, so the menu writes the cookie and the choice sticks.
 */
export async function resolveVisitorCountry(
  query?: string | string[] | null,
  at?: { segment: string | undefined; page: MarketingPage },
): Promise<VisitorCountry> {
  if (at && at.segment !== undefined) return resolveCountryPage(at.segment, at.page)
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
    paths: { landing: '/landing', features: '/features', compare: '/compare' },
    countryPage: null,
  }
}

/**
 * 🔴 A COUNTRY PAGE (Language Phase 1e) — /uk, /us/features, … — app/[country]/… pass the address segment. The
 * country is the ADDRESS's, never the visitor's: no ?country, cookie or location is read, so the page is the same
 * for everyone who opens that address (the router at the un-prefixed addresses is where the visitor is placed).
 *   • Not a HatchGrab host → 404. Country addresses exist on HatchGrab only; Village Foodie never had them.
 *   • A segment that is not in COUNTRY_PATH_SEGMENTS → 404 (app/[country] also sets dynamicParams = false).
 *   • A switched-off country (not GB) → the GB page. ⚠️ BACKSTOP ONLY: proxy.ts already answers that address with a
 *     302 before this runs. This catches the one gap — a proxy instance whose 60-second country cache still had the
 *     country switched on — and Next's redirect() here is a 307, not a 302.
 *   • The menu lists the switched-on countries that have an address; `remember` is never set (an address is not a
 *     choice — the menu itself writes the cookie when the visitor picks).
 */
async function resolveCountryPage(segment: string, page: MarketingPage): Promise<VisitorCountry> {
  if (!isHatchGrabHost((await headers()).get('host') || '')) notFound()
  const code = countryOfSegment(segment)
  if (!code) notFound()
  const all = await listCountrySettingsCached()
  const live = all.filter(c => c.enabled && c.countryCode in COUNTRY_PATH_SEGMENTS)
  const isLive = live.some(c => c.countryCode === code)
  if (!isLive && code !== MARKETING_COUNTRY) redirect(countryPagePath(MARKETING_COUNTRY, page)!)
  const settings = all.find(c => c.countryCode === code)
  if (!settings) throw new Error(`[visitor-country] no country_settings row for ${code}`)
  const options = (isLive ? live : [settings, ...live]).map(optionOf)
  return {
    settings,
    menu: { current: optionOf(settings), options, remember: null },
    paths: {
      landing: countryPagePath(code, 'landing')!, features: countryPagePath(code, 'features')!, compare: countryPagePath(code, 'compare')!,
    },
    countryPage: { alternates: live.map(c => ({ code: c.countryCode, locale: c.locale })) },
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
