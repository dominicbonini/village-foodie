import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { listCountrySettingsCached } from '@/lib/country-settings'
import { HATCHGRAB_ORIGIN, MARKETING_COUNTRY, countryPagePath, routableCountries } from '@/lib/marketing-country'

// app/sitemap.ts — serves /sitemap.xml. There was none before.
//
// 🔴 SCOPE IS DELIBERATELY TINY, AND TWO OF THE THREE URLS ASKED FOR DO NOT EXIST AS ROUTES:
//   • `/pricing` is NOT a route — it is `<section id="pricing">` on the landing page
//     (app/landing/page.tsx). A sitemap entry for it would be a 404, which is worse than no entry.
//   • `/landing` and `/` are THE SAME PAGE on a hatchgrab host: proxy.ts rewrites '/' to '/landing'.
//     Listing both would contradict the canonical this page now declares (the apex-less www root).
// So the HatchGrab sitemap carried exactly one URL, and that was honest rather than thin.
//
// ── 🟢 /features IS THE SECOND URL, ADDED 6 October 2026 ───────────────────────────────────────────
// It is a REAL ROUTE (app/features/page.tsx), unlike the `/pricing` non-route above, and it is
// `robots: { index: true, follow: true }` with its own canonical — so a sitemap entry agrees with the
// page's own declarations instead of contradicting them, which is the test the three exclusions below
// each fail. It carries the comparison table that used to be a section of the landing page; indexing
// it is what stops a move from a public page making that content unfindable.
// ⚠️ `priority` 0.8 AND `changeFrequency: 'monthly'` — below the root, because it is a reference page
// rather than the entry point, and the table only changes when a plan does.
//
// 🔴 EXCLUDED ON PURPOSE:
//   • /compare — still robots:{index:false}, a separate launch decision that is not mine to reverse.
//   • /trucks/[slug] — already `X-Robots-Tag: noindex` from vercel.json, so a sitemap entry would
//     contradict a header the CDN is already sending.
//   • /venues/[slug] — indexable, and a real opportunity, but some venues carry stale events and the
//     set changes constantly. Enumerating them is a separate decision with its own data-quality work.
//
// ── 🟢 THE COUNTRY ADDRESSES, ADDED 16 October 2026 (Language Phase 1e) ─────────────────────────────────────
// /uk and /uk/features — and /us, /us/features while the US is switched on — are each a page's own canonical, so
// they are listed, with the same frequency and priority as the router address of the same page. The two entries
// above are KEPT EXACTLY: '/' and '/features' are now the router (x-default — each page's hreflang names them as
// x-default), unchanged here as Dominic's spec asks.
// 🔴 A SWITCHED-OFF COUNTRY IS LEFT OUT — its address 302s to the GB page, and a sitemap must not list a redirect.
// 🔴 /compare STAYS OUT FOR EVERY COUNTRY (/uk/compare, /us/compare too): every compare address is still robots
// noindex, and listing a page that asks not to be indexed contradicts it — the same reason /compare was excluded.
// ⚠️ THE COUNTRY LIST IS READ THROUGH THE 60-SECOND CACHED LOADER; if it cannot be read, GB alone is listed rather
// than the sitemap failing.
//
// ⚠️ HOST-AWARE: one deployment serves both brands, and a host-blind sitemap would advertise
// HatchGrab URLs on villagefoodie.co.uk.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host') ?? 'www.hatchgrab.com'
  const isHG = host.includes('hatchgrab')
  if (isHG) {
    let live: string[]
    try {
      live = routableCountries((await listCountrySettingsCached()).filter(c => c.enabled).map(c => c.countryCode))
    } catch {
      live = []
    }
    if (!live.includes(MARKETING_COUNTRY)) live = [MARKETING_COUNTRY, ...live]   // GB's address never redirects
    return [
      { url: 'https://www.hatchgrab.com/', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
      { url: 'https://www.hatchgrab.com/features', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
      ...live.flatMap((code): MetadataRoute.Sitemap => [
        { url: HATCHGRAB_ORIGIN + countryPagePath(code, 'landing'), lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
        { url: HATCHGRAB_ORIGIN + countryPagePath(code, 'features'), lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
      ]),
    ]
  }
  // Village Foodie: the discovery root only. /venues/[slug] is deliberately not enumerated here yet.
  return [{ url: 'https://www.villagefoodie.co.uk/', lastModified: new Date(), changeFrequency: 'daily', priority: 1 }]
}
