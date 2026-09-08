import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

// app/sitemap.ts — serves /sitemap.xml. There was none before.
//
// 🔴 SCOPE IS DELIBERATELY TINY, AND TWO OF THE THREE URLS ASKED FOR DO NOT EXIST AS ROUTES:
//   • `/pricing` is NOT a route — it is `<section id="pricing">` on the landing page
//     (app/landing/page.tsx). A sitemap entry for it would be a 404, which is worse than no entry.
//   • `/landing` and `/` are THE SAME PAGE on a hatchgrab host: proxy.ts rewrites '/' to '/landing'.
//     Listing both would contradict the canonical this page now declares (the apex-less www root).
// So the HatchGrab sitemap carries exactly one URL, and that is honest rather than thin.
//
// 🔴 EXCLUDED ON PURPOSE:
//   • /compare — still robots:{index:false}, a separate launch decision that is not mine to reverse.
//   • /trucks/[slug] — already `X-Robots-Tag: noindex` from vercel.json, so a sitemap entry would
//     contradict a header the CDN is already sending.
//   • /venues/[slug] — indexable, and a real opportunity, but some venues carry stale events and the
//     set changes constantly. Enumerating them is a separate decision with its own data-quality work.
//
// ⚠️ HOST-AWARE: one deployment serves both brands, and a host-blind sitemap would advertise
// HatchGrab URLs on villagefoodie.co.uk.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host') ?? 'www.hatchgrab.com'
  const isHG = host.includes('hatchgrab')
  if (isHG) {
    return [{ url: 'https://www.hatchgrab.com/', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 }]
  }
  // Village Foodie: the discovery root only. /venues/[slug] is deliberately not enumerated here yet.
  return [{ url: 'https://www.villagefoodie.co.uk/', lastModified: new Date(), changeFrequency: 'daily', priority: 1 }]
}
