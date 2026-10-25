import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { listCountrySettingsCached } from '@/lib/country-settings'
import { HATCHGRAB_ORIGIN, MARKETING_COUNTRY, countryPagePath, routableCountries } from '@/lib/marketing-country'
import { countryPageAlternates, MARKETING_COPY_UPDATED } from '@/lib/marketing-meta'
import { planDataUpdatedAt } from '@/lib/plans-server'
import { PRIVACY_PATH, TERMS_PATH, COUNTRY_TERMS_PATH, PRIVACY_UPDATED, TERMS_UPDATED, COUNTRY_TERMS_UPDATED, legalUpdatedDate } from '@/lib/legal'
import { BRANDS } from '@/lib/brand'
import { ABOUT_PATH, ABOUT_UPDATED } from '@/lib/about'
import { liveComparisonPages } from '@/lib/comparison-server'

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
// they are listed, with the same frequency and priority the router address of the same page had.
// ⛔ '/' AND '/features' ARE NO LONGER LISTED (Language Phase 1e tidy, Dominic): they are the router now — a 302 to
// the visitor's country page — and a sitemap must not list a redirect. They stay each page's hreflang x-default.
// 🔴 A SWITCHED-OFF COUNTRY IS LEFT OUT — its address 302s to the GB page, and a sitemap must not list a redirect.
// 🔴 /compare STAYS OUT FOR EVERY COUNTRY (/uk/compare, /us/compare too): every compare address is still robots
// noindex, and listing a page that asks not to be indexed contradicts it — the same reason /compare was excluded.
// ⚠️ THE COUNTRY LIST IS READ THROUGH THE 60-SECOND CACHED LOADER; if it cannot be read, GB alone is listed rather
// than the sitemap failing.
//
// ⚠️ HOST-AWARE: one deployment serves both brands, and a host-blind sitemap would advertise
// HatchGrab URLs on villagefoodie.co.uk.
//
// ── 🟢 seo-fixes S5 (20 October 2026, docs/seo-fixes-report.md) ────────────────────────────────────────────────────────
//   • lastmod is a REAL content date, never request time: a country page's is the latest of its copy date
//     (MARKETING_COPY_UPDATED), the plan data it shows (plans / that country's plan_prices / plan_features updated_at)
//     and the country's settings row; a legal page's is its own "Last updated" date (lib/legal.ts). /contact has no
//     content date, so it carries no lastmod rather than an invented one.
//   • the indexable legal pages (/privacy, /terms, /country-terms) and /contact are listed — on the HatchGrab host only
//     (their canonical is the HatchGrab address on every host, so the Village Foodie sitemap does not list them).
//   • each country page carries its hreflang alternates as xhtml:link — the SAME set as its <head>
//     (lib/marketing-meta.ts countryPageAlternates: every listed country + x-default).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host') ?? 'www.hatchgrab.com'
  const isHG = host.includes('hatchgrab')
  if (isHG) {
    let rows: Awaited<ReturnType<typeof listCountrySettingsCached>> = []
    try { rows = await listCountrySettingsCached() } catch { rows = [] }
    let live = routableCountries(rows.filter(c => c.enabled).map(c => c.countryCode))
    if (!live.includes(MARKETING_COUNTRY)) live = [MARKETING_COUNTRY, ...live]   // GB's address never redirects
    const localeOf = (code: string) => rows.find(r => r.countryCode === code)?.locale ?? 'en-GB'
    const alternates = live.map(code => ({ code, locale: localeOf(code) }))
    const latest = (...ds: (Date | null | undefined)[]) => new Date(Math.max(...ds.filter((d): d is Date => !!d && Number.isFinite(d.getTime())).map(d => d.getTime())))
    const countryPages = await Promise.all(live.map(async (code): Promise<MetadataRoute.Sitemap> => {
      const settingsAt = rows.find(r => r.countryCode === code)?.updatedAt
      const lastModified = latest(new Date(MARKETING_COPY_UPDATED), await planDataUpdatedAt(code), settingsAt ? new Date(settingsAt) : null)
      return [
        { url: HATCHGRAB_ORIGIN + countryPagePath(code, 'landing'), lastModified, changeFrequency: 'weekly', priority: 1,
          alternates: { languages: countryPageAlternates('landing', code, alternates).languages } },
        { url: HATCHGRAB_ORIGIN + countryPagePath(code, 'features'), lastModified, changeFrequency: 'monthly', priority: 0.8,
          alternates: { languages: countryPageAlternates('features', code, alternates).languages } },
      ]
    }))
    // compare-de-1 (24 October 2026): a country's comparison page — ONLY while its comparison_status is 'live'. lastmod is
    // the newest check date the public page shows; hreflang names the page itself only (one language, one country).
    const comparisons: MetadataRoute.Sitemap = (await liveComparisonPages()).map(c => ({
      url: c.url, lastModified: new Date(c.checked), changeFrequency: 'monthly', priority: 0.7, alternates: { languages: { [c.locale]: c.url } },
    }))
    return [
      ...countryPages.flat(),
      ...comparisons,
      { url: HATCHGRAB_ORIGIN + PRIVACY_PATH, lastModified: legalUpdatedDate(PRIVACY_UPDATED), changeFrequency: 'yearly', priority: 0.3 },
      { url: HATCHGRAB_ORIGIN + TERMS_PATH, lastModified: legalUpdatedDate(TERMS_UPDATED), changeFrequency: 'yearly', priority: 0.3 },
      { url: HATCHGRAB_ORIGIN + COUNTRY_TERMS_PATH, lastModified: legalUpdatedDate(COUNTRY_TERMS_UPDATED), changeFrequency: 'yearly', priority: 0.3 },
      { url: HATCHGRAB_ORIGIN + '/contact', changeFrequency: 'yearly', priority: 0.3 },
      // about-page (22 October 2026): HatchGrab only; lastmod is the page's own words' date (lib/about.ts ABOUT_UPDATED).
      { url: HATCHGRAB_ORIGIN + ABOUT_PATH, lastModified: legalUpdatedDate(ABOUT_UPDATED), changeFrequency: 'yearly', priority: 0.3 },
    ]
  }
  // Village Foodie: the discovery root, and /contact — self-canonical on this host since pricing-tidy, so listed here
  // (compare-tidy F2, 20 October 2026), with no lastmod, like the HatchGrab /contact. /venues/[slug] is deliberately not
  // enumerated here yet. The root's content changes daily (the events), so it carries no lastmod rather than request time.
  return [
    { url: `https://${BRANDS.VILLAGE_FOODIE.domain}/`, changeFrequency: 'daily', priority: 1 },
    { url: `https://${BRANDS.VILLAGE_FOODIE.domain}/contact`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
