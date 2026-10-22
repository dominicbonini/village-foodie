// lib/marketing-country.ts — WHICH COUNTRY'S PRICES THE PUBLIC PAGES SHOW. Named once, here.
//
// The landing page, /features (components/pricing/PlanTable.tsx), /compare and Admin's plans table all quote ONE
// country's plan prices, allowances and card fees, and before 10 October 2026 that country was implicit
// in a dozen constants. It is now this one value, read through lib/country-settings.ts.
//
// 🔴 SINCE PHASE 2D-1 THIS IS THE FALLBACK, NOT THE ANSWER. The marketing pages show the VISITOR's country
// (lib/visitor-country.ts: ?country → the hg_country cookie → x-vercel-ip-country → this), switched-on only.
// It is still the country signup pre-fills when the visitor's is not open, and what admin-side marketing
// copy (outreach, Admin's plan matrix) quotes. Operator surfaces (Manage → Billing / Payments, one truck in
// Admin) do NOT use this — they use the truck's own country.
//
// 🔴 PURE AND CLIENT-SAFE — NO IMPORTS. proxy.ts (the country router), the country menu (a client component)
// and the server pages all read the table below, so it must never pull in a server module.
export const MARKETING_COUNTRY = 'GB'

// ══ 🔴 THE COUNTRY ADDRESSES (Language Phase 1e) ════════════════════════════════════════════════════════════
// Each marketing page has one address per country — /uk, /uk/features, /uk/compare and /us, /us/features,
// /us/compare — served by app/[country]/… (which RE-USE the landing, features and compare page modules; never a
// copy). The un-prefixed addresses — hatchgrab.com/, /landing, /features, /compare and the unlisted landing
// preview — are the ROUTER (x-default): proxy.ts 302s them to the visitor's country's page.
// ⚠️ THIS TABLE IS THE ONLY PLACE A COUNTRY GETS AN ADDRESS. A country switched on in country_settings but
// missing here has no page, so the router, the hreflang set, the sitemap and the menu all leave it out
// (routableCountries) — switching a country on never produces a link to a 404.
// ⛔ THE SEGMENT IS NOT THE ISO CODE: the United Kingdom's code is GB, its address is /uk.
// ireland-1 (20 October 2026): Ireland's address is /ie. Having an address does not make a country visible — like the
// US before it, /ie 302s to /uk and is left out of the router, hreflang, sitemap and menu until country_settings has an
// IE row with enabled = true (a missing row counts as switched off everywhere these addresses are read).
// anz-1 (21 October 2026): Australia /au and New Zealand /nz, on the same terms — invisible until each has an enabled row.
// canada-1 (22 October 2026): Canada's address, /ca. While CA is switched off (or has no row) it 302s to /uk like any
// switched-off country, and it is in no router pick, hreflang set, sitemap or menu.
// france-1 (22 October 2026): France's address, /fr — the first page in a language other than English (fr-FR). Switched
// off, it 302s to /uk like the others.
export const COUNTRY_PATH_SEGMENTS: Readonly<Record<string, string>> = { GB: 'uk', US: 'us', IE: 'ie', AU: 'au', NZ: 'nz', CA: 'ca', FR: 'fr',
  // europe-settings (22 October 2026): the rest of Stripe's Europe — each at its ISO code. Switched off, every one 302s to /uk.
  AT: 'at', BE: 'be', BG: 'bg', HR: 'hr', CY: 'cy', CZ: 'cz', DK: 'dk', EE: 'ee', FI: 'fi', DE: 'de', GI: 'gi', GR: 'gr', HU: 'hu', IT: 'it', LV: 'lv', LI: 'li', LT: 'lt', LU: 'lu', MT: 'mt', NL: 'nl', NO: 'no', PL: 'pl', PT: 'pt', RO: 'ro', SK: 'sk', SI: 'si', ES: 'es', SE: 'se', CH: 'ch' }

/** The three marketing pages that have a country address. */
export type MarketingPage = 'landing' | 'features' | 'compare'

/** The host every canonical, og:url, hreflang and sitemap URL names — one host, the www one (as app/layout.tsx's
 *  metadataBase now is). */
export const HATCHGRAB_ORIGIN = 'https://www.hatchgrab.com'

/** The router (x-default) address of each page — what the page was served at before country addresses. */
export const ROUTER_PATH: Readonly<Record<MarketingPage, string>> = { landing: '/', features: '/features', compare: '/compare' }

/**
 * The paths the router answers on a HatchGrab host, and which page each one means. Exact paths only.
 * ⚠️ '/1ng7n4p5omux2gdk9kqvwz' is the UNLISTED landing preview (app/1ng7n4p5omux2gdk9kqvwz) — it routes like '/'.
 */
export const ROUTER_PATHS: Readonly<Record<string, MarketingPage>> = {
  '/': 'landing', '/landing': 'landing', '/1ng7n4p5omux2gdk9kqvwz': 'landing',
  '/features': 'features', '/compare': 'compare',
}

const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '')

/** The ISO code an address segment names ('uk' → 'GB'), or null. Lower-case only — '/UK' is not an address. */
export function countryOfSegment(segment: string | null | undefined): string | null {
  for (const [code, seg] of Object.entries(COUNTRY_PATH_SEGMENTS)) if (seg === segment) return code
  return null
}

/** A country page's path: ('GB', 'landing') → '/uk', ('US', 'features') → '/us/features'. Null for a country with no address. */
export function countryPagePath(code: string, page: MarketingPage): string | null {
  const seg = COUNTRY_PATH_SEGMENTS[upper(code)]
  if (!seg) return null
  return page === 'landing' ? `/${seg}` : `/${seg}/${page}`
}

/** Which country page a pathname is: '/us/compare' → { code: 'US', page: 'compare' }; anything else → null. */
export function countryPageOf(pathname: string): { code: string; page: MarketingPage } | null {
  const m = /^\/([a-z]+)(?:\/(features|compare))?$/.exec(pathname)
  const code = m && countryOfSegment(m[1])
  return code ? { code, page: (m![2] as MarketingPage | undefined) ?? 'landing' } : null
}

/** The switched-on countries that HAVE an address, in the given order. */
export function routableCountries(enabledCodes: string[]): string[] {
  return enabledCodes.map(upper).filter(c => c in COUNTRY_PATH_SEGMENTS)
}

/** Pure: pick the country from the four sources, given the switched-on list (?country → cookie → IP → GB). */
export function pickMarketingCountry(enabledCodes: string[], src: { query?: unknown; cookie?: unknown; ip?: unknown }):
  { code: string; fromQuery: boolean } {
  const on = (c: string) => !!c && enabledCodes.includes(c)
  const q = upper(src.query); if (on(q)) return { code: q, fromQuery: true }
  const k = upper(src.cookie); if (on(k)) return { code: k, fromQuery: false }
  const ip = upper(src.ip); if (on(ip)) return { code: ip, fromQuery: false }
  return { code: MARKETING_COUNTRY, fromQuery: false }
}

/**
 * 🔴 THE ROUTER AND THE SWITCHED-OFF GATE, AS ONE PURE DECISION (proxy.ts calls it on a HatchGrab host only).
 *   • a ROUTER path → 302 to the visitor's country's matching page (?country → hg_country → IP → GB, among the
 *     switched-on countries that have an address). The query is kept, minus `country`; when ?country chose, the
 *     choice is returned as `remember` so the proxy keeps it in the hg_country cookie (as the menu did before).
 *   • a COUNTRY page whose country is switched off → 302 to the GB page of the same kind (query kept, minus country).
 *     ⛔ The GB page is never redirected — it is the floor, even if GB itself were ever switched off.
 *   • anything else → null (no redirect; a switched-on country page renders).
 * `enabledCodes` must already be routable (routableCountries).
 */
export function marketingRedirect(pathname: string, search: string, enabledCodes: string[], src: { cookie?: unknown; ip?: unknown }):
  { location: string; remember: string | null } | null {
  const params = new URLSearchParams(search)
  const query = params.get('country')
  params.delete('country')
  const rest = params.toString()
  const withQuery = (p: string) => (rest ? `${p}?${rest}` : p)

  const routed = Object.prototype.hasOwnProperty.call(ROUTER_PATHS, pathname) ? ROUTER_PATHS[pathname] : undefined
  if (routed) {
    const picked = pickMarketingCountry(enabledCodes, { query, cookie: src.cookie, ip: src.ip })
    const to = countryPagePath(picked.code, routed) ?? countryPagePath(MARKETING_COUNTRY, routed)!
    return { location: withQuery(to), remember: picked.fromQuery ? picked.code : null }
  }
  const page = countryPageOf(pathname)
  if (page && page.code !== MARKETING_COUNTRY && !enabledCodes.includes(page.code)) {
    return { location: withQuery(countryPagePath(MARKETING_COUNTRY, page.page)!), remember: null }
  }
  return null
}

/** The same page in another country, for the country menu: ('/uk/features', 'US') → '/us/features'. Null when the
 *  current path is not a country page or the country has no address. */
export function switchCountryPath(pathname: string, code: string): string | null {
  const here = countryPageOf(pathname)
  return here ? countryPagePath(code, here.page) : null
}
