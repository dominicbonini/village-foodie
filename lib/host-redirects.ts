// lib/host-redirects.ts — 🔴 WHICH PAGES BELONG TO THE OTHER BRAND'S HOST (faq-2-seo-geo-2 B1, 2 November 2026;
// docs/faq-2-seo-geo-2-report.md). PURE: proxy.ts asks it on every request, scripts/seo-geo-2.cjs proves it.
//
// One deployment serves both brands, so every page answers on both hosts. These are the ones a search engine found on the wrong one:
//   • Village Foodie's consumer pages on www.hatchgrab.com — /venues/<slug>, /trucks (the directory) and /hire, each titled
//     "… | Village Foodie" — move PERMANENTLY (308) to the same path on www.villagefoodie.co.uk, where each exists.
//   • the unlisted HatchGrab landing preview on www.villagefoodie.co.uk (indexable there, canonical pointing at hatchgrab.com)
//     moves to the same path on www.hatchgrab.com.
// ⛔ NOT MOVED, ON PURPOSE:
//   • /trucks/<slug>/order — HatchGrab's order page: WhatsApp replies, the payment return and the printed QR (/o → /order) all land
//     on it, and moving ordering to another domain would change how customers pay. It is noindex already (vercel.json) and
//     disallowed in robots.txt.
//   • /trucks/<slug> — noindex already and robots-disallowed; whether a truck exists on Village Foodie (UK only) is a database
//     question this edge rule cannot ask.
// Only the PRODUCTION hosts: a preview or local host (hatchgrab.localhost) is never sent to production.
export const HG_PROD_HOSTS = new Set(['www.hatchgrab.com', 'hatchgrab.com'])
export const VF_PROD_HOSTS = new Set(['www.villagefoodie.co.uk', 'villagefoodie.co.uk'])
export const VF_ORIGIN = 'https://www.villagefoodie.co.uk'
export const HG_ORIGIN = 'https://www.hatchgrab.com'
const HG_PREVIEW_PATH = '/1ng7n4p5omux2gdk9kqvwz'

/** Is this a Village Foodie consumer page (by path)? */
export const isVillageFoodiePage = (pathname: string): boolean =>
  pathname === '/hire' || pathname === '/trucks' || /^\/venues\/[^/]+\/?$/.test(pathname)

/** The address a request should move to (308), or null. `search` keeps its leading '?'. */
export function crossHostRedirect(host: string, pathname: string, search: string): string | null {
  const h = host.toLowerCase()
  if (HG_PROD_HOSTS.has(h) && isVillageFoodiePage(pathname)) return `${VF_ORIGIN}${pathname}${search}`
  if (VF_PROD_HOSTS.has(h) && pathname === HG_PREVIEW_PATH) return `${HG_ORIGIN}${pathname}${search}`
  return null
}
