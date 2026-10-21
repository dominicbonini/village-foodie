// lib/landing-screens.ts — which screenshot the landing page's hero fan shows, per marketing country (Language Phase 1e).
//
// The GB files are real device captures (£, 24-hour clock, UK dates). The US files are the REAL components — the
// order page, the dashboard's Add order tab and the kitchen screen — rendered for a US fixture truck (Pizza Kitchen
// with US settings: $, 12-hour clock, US dates and words), painted in WebKit with the app's compiled CSS at the GB
// capture's device size and crop, and framed with the GB capture's own status bar / Safari bar (clock redrawn in
// the US form). Each US file is the SAME pixel size as the GB file it replaces, so the CSS frames (landing.css
// `.shot-*` aspect ratios) and the <Image> width/height fit both.
// ⚠️ Never delete the GB files. A country with no files of its own shows the GB ones (today's behaviour).

export type LandingScreen = 'kitchen' | 'dashboard' | 'phone'

const GB: Record<LandingScreen, string> = {
  kitchen: '/screenshots/kitchen.png',
  dashboard: '/screenshots/dashboard-v4.png',
  phone: '/screenshots/customer-order.png',
}
const BY_COUNTRY: Record<string, Record<LandingScreen, string>> = {
  US: {
    kitchen: '/screenshots/kitchen-us.png',
    dashboard: '/screenshots/dashboard-v4-us.png',
    phone: '/screenshots/customer-order-us.png',
  },
  // ireland-1 (20 October 2026): the same three screens for an Irish fixture truck (€, en-IE, Europe/Dublin, 24-hour,
  // day-month dates, Irish names) — scripts/screenshots/ie-screens.cjs (README-ie.md). The GB captures already show a
  // 24-hour clock, so their status bars are kept exactly as captured. Shown only on IE pages (/ie, while Ireland is on).
  IE: {
    kitchen: '/screenshots/kitchen-ie.png',
    dashboard: '/screenshots/dashboard-v4-ie.png',
    phone: '/screenshots/customer-order-ie.png',
  },
  // anz-1 (21 October 2026): Australian and New Zealand fixture trucks ($ on the menu, en-AU / en-NZ, Australia/Sydney and
  // Pacific/Auckland, 12-hour clock, day-month dates) — scripts/screenshots/anz-screens.cjs (README-anz.md). Never Gusto.
  // Shown only on AU / NZ pages (/au, /nz, while each is on).
  AU: {
    kitchen: '/screenshots/kitchen-au.png',
    dashboard: '/screenshots/dashboard-v4-au.png',
    phone: '/screenshots/customer-order-au.png',
  },
  NZ: {
    kitchen: '/screenshots/kitchen-nz.png',
    dashboard: '/screenshots/dashboard-v4-nz.png',
    phone: '/screenshots/customer-order-nz.png',
  },
}

/** The public path of a hero screenshot for the visitor's marketing country (its ISO code, e.g. 'GB', 'US'). */
export function landingScreenshot(name: LandingScreen, countryCode: string | null | undefined): string {
  return BY_COUNTRY[(countryCode || '').toUpperCase()]?.[name] ?? GB[name]
}
