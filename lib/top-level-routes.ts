// lib/top-level-routes.ts — cwv-2 (6 November 2026, docs/cwv-2-report.md §4): EVERY ONE-SEGMENT ADDRESS THAT IS NOT A COUNTRY PAGE. Pure.
// app/(public)/[country] catches every one-segment address that has no route or file of its own (/wp-admin, /o, /demo), and its pages
// are built ahead, so they cannot read the request to word a 404 in the visitor's language or brand it for the host. proxy.ts therefore
// sends such an address to the app's own 404 (app/global-not-found.tsx) itself, exactly the page and status it had before. This is the
// list of the ones it must NOT send there: a route at exactly that one segment, or a file at the top of public/.
// ⛔ scripts/cwv-2.cjs recomputes both lists from the filesystem and fails if a route or a public file is added without its name here.
export const ONE_SEGMENT_ROUTES: readonly string[] = ['1ng7n4p5omux2gdk9kqvwz', 'about', 'admin', 'app', 'compare', 'contact', 'country-terms', 'dashboard',
  'domain', 'faq', 'features', 'forgot-password', 'hire', 'landing', 'llms.txt', 'login', 'manage', 'privacy', 'reset-password', 'robots.txt', 'setup',
  'signup', 'sitemap.xml', 'terms', 'trucks', 'verify-email']
export const PUBLIC_TOP_FILES: readonly string[] = ['07509b28087e749402ef79858216bd5a.txt', 'apple-touch-icon.png', 'favicon.ico', 'file.svg', 'globe.svg',
  'gusto-logo.png', 'manifest.json', 'next.svg', 'offline.html', 'og.image.png', 'sw.js', 'vercel.svg', 'window.svg']

const KNOWN = new Set<string>([...ONE_SEGMENT_ROUTES, ...PUBLIC_TOP_FILES])
/** True for a one-segment address with a route or a public file of its own. */
export const isOwnOneSegment = (segment: string): boolean => KNOWN.has(segment)
