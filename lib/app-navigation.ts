// lib/app-navigation.ts — app-fixes-1 (14 November 2026, docs/app-fixes-1-report.md §4): WHAT MAY LOAD INSIDE THE APP.
//
// The iOS / Android apps are a shell around this website (capacitor.config server.url = /app, allowNavigation = the site's
// own host), so ANY same-site address can load inside them — including the landing page, which has no way back into the
// app. Only the operator's screens belong there. This is the ONE list, used by:
//   • components/native/InAppNavigationGuard.tsx — a tap on a link, in the app only;
//   • proxy.ts — a page request carrying the app's user-agent marker (the catch-all for anything the guard did not see).
// PURE: no Capacitor, no React, nothing server-only — the edge proxy imports it.
//
//   'stay'    — the dashboard (incl. its kitchen screen, /kds), Manage, the login / account pages, /app itself, admin,
//               the API and static files.
//   'browser' — customer- and organiser-facing pages (a truck's order page and schedule, order tracking, private-event and
//               paperwork links, the embed, venue pages, the booking form, the legal documents): opened in the phone's
//               browser, never inside the app.
//   'app'     — everything else (the landing page "/", country pages, features / FAQ / compare / about / contact / demo…):
//               inside the app that is /app, which routes to the device's dashboard, or to login when signed out.
export type InAppRoute = 'stay' | 'browser' | 'app'

const STAY = ['/app', '/dashboard', '/manage', '/kds', '/login', '/signup', '/setup', '/forgot-password', '/reset-password', '/verify-email', '/auth', '/admin', '/dev', '/api', '/_next', '/monitoring', '/ingest']
const BROWSER = ['/trucks', '/o', '/p', '/order', '/embed', '/venues', '/hire', '/docs', '/privacy', '/terms', '/country-terms']
const under = (p: string, base: string) => p === base || p.startsWith(base + '/')

export function inAppRoute(pathname: string): InAppRoute {
  const p = (pathname || '/').split(/[?#]/)[0] || '/'
  if (STAY.some(b => under(p, b))) return 'stay'
  // A file (an icon, /offline.html, /sw.js, a font): never a page.
  if (/\/[^/]+\.[a-z0-9]{2,5}$/i.test(p)) return 'stay'
  if (BROWSER.some(b => under(p, b))) return 'browser'
  // A translated legal document: /<country segment>/privacy | terms | country-terms (lib/legal.ts legalPath).
  if (/^\/[^/]+\/(privacy|terms|country-terms)(\/|$)/.test(p)) return 'browser'
  return 'app'
}

/** The address to hand to the phone's browser for a same-site page. Both shells keep their OWN host inside the app
 *  (iOS: allowNavigation; Android: Bridge.launchIntent compares the host), so the www site is opened through the bare domain,
 *  which every browser follows straight back to www (a 308 that keeps the path). On any other host (localhost in
 *  development) the address is unchanged. */
export function browserUrlFor(url: URL): string {
  const out = new URL(url.toString())
  if (out.hostname.startsWith('www.')) out.hostname = out.hostname.slice(4)
  return out.toString()
}
