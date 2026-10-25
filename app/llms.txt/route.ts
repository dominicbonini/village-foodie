// app/llms.txt/route.ts — serves /llms.txt on the HatchGrab host: a short markdown summary for AI answer engines
// (ai-search-1, 21 October 2026; docs/ai-search-1-report.md; the format is llmstxt.org's — an H1, a one-line summary in a
// blockquote, then sections of plain facts and links).
//
// 🔴 BUILT FROM DATA AT REQUEST TIME, LIKE THE PRICING SECTION: the switched-on countries (country_settings, through the
// cached loader — a switched-off or address-less country never appears), each one's public plans and prices
// (plan_prices via lib/plan-offer.ts offerPlans — the rows the pricing cards render), the fee each plan charges, the
// trial length and the plan a trial falls back to (plans), and each country's card-processing rate (country_settings).
// ⛔ NO CLAIM THE SITE DOES NOT ALREADY MAKE: every sentence is the pricing section's or the landing's own, in plain text.
// ⚠️ HOST-AWARE: the Village Foodie host has no llms.txt (404), as its sitemap lists no HatchGrab page.
import { headers } from 'next/headers'
import { listCountrySettingsCached } from '@/lib/country-settings'
import { getPlanCatalog } from '@/lib/plans-server'
import { MARKETING_COUNTRY, routableCountries } from '@/lib/marketing-country'
import { llmsText } from '@/lib/llms-text'
// compare-de-1: the live comparison pages, under "Comparisons" (none while every country is off or admin-only).
import { liveComparisonPages } from '@/lib/comparison-server'

export async function GET() {
  const host = (await headers()).get('host') ?? ''
  if (!host.includes('hatchgrab')) return new Response('Not found', { status: 404 })
  const all = await listCountrySettingsCached()
  const live = new Set(routableCountries(all.filter(c => c.enabled).map(c => c.countryCode)))
  // The marketing order: the UK first (the site's floor), then by name — as the country menu lists them.
  const countries = all.filter(c => live.has(c.countryCode)).sort((a, b) => (a.countryCode === MARKETING_COUNTRY ? -1 : b.countryCode === MARKETING_COUNTRY ? 1 : a.name.localeCompare(b.name)))
  const catalog = await getPlanCatalog()
  return new Response(llmsText(countries, catalog, await liveComparisonPages()), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
