// lib/comparison-server.ts — a country's comparison page, loaded on the server (compare-de-1, 24 October 2026;
// docs/compare-de-1-report.md). SERVICE ROLE, SERVER ONLY.
//
// • `comparisonFlags()` (lib/comparison-flags.ts, small enough for proxy.ts) — every country's comparison_status and app flags (country_settings, 20261042), cached 60 s like
//   lib/country-settings.ts; Admin › Countries clears it after a save. 🔴 TOLERANT: before 20261042 runs the columns are
//   not there, and every country reads 'off' with no apps — the page, its footer link, sitemap, llms and hreflang entries
//   do not exist anywhere, which is also exactly the state the migration starts in.
// • `comparisonPage(code)` — what lib/comparison.ts needs: the country's settings and plan catalogue (in its language),
//   the competitors, their plans and the country's entries (public.competitors / competitor_plans / comparison_entries —
//   RLS on, no policies; read here with the service role, never by a browser).
// • `comparisonAddress(code)` — the page's path from the country's own messages (comparison.path.section / slug), or
//   null when the country's language has no comparison page.
import 'server-only'
import { getCountrySettings } from '@/lib/country-settings'
import { getPlanCatalog } from '@/lib/plans-server'
import { localizePlans } from '@/lib/plan-names'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/comparison'
import { COUNTRY_PATH_SEGMENTS, HATCHGRAB_ORIGIN, countryPagePath } from '@/lib/marketing-country'
import { contactHref } from '@/lib/contact-topics'
import { servicePricingStore } from '@/lib/admin/pricing-check-store'
import { competitorOut, planOut, entryOut } from '@/lib/admin/pricing-check-actions'
import { buildComparison, type ComparisonFlags, type ComparisonInput, type ComparisonT } from '@/lib/comparison'
import { comparisonFlags, comparisonFlagsOf } from '@/lib/comparison-flags'
export { comparisonFlags, comparisonFlagsOf, clearComparisonCache } from '@/lib/comparison-flags'
import { isCountedCompetitor, isPendingPos, type Competitor, type CompetitorPlan, type ComparisonEntry } from '@/lib/pricing-check'

/** The countries whose page is public (sitemap, /llms.txt, footers). */
export async function liveComparisonCodes(): Promise<string[]> {
  return [...(await comparisonFlags()).values()].filter(f => f.status === 'live').map(f => f.countryCode)
}

/** The page's translator in the country's language. */
export function comparisonT(locale: string): ComparisonT & { has(key: string): boolean } {
  return translatorFor(locale, 'comparison' as never) as unknown as ComparisonT & { has(key: string): boolean }
}

/** The address of a country's comparison page — '/de/vergleich/foodtruck-bestellsystem' — or null when the country has
 *  no address or its language has no comparison page (the namespace is German and English only: docs/i18n/scoped-namespaces.json). */
export function comparisonPath(code: string, locale: string): string | null {
  const seg = COUNTRY_PATH_SEGMENTS[code.toUpperCase()]
  if (!seg || !/^(de|en)(-|$)/i.test(locale)) return null
  const t = comparisonT(locale)
  return `/${seg}/${t('path.section')}/${t('path.slug')}`
}

/** The comparison data: competitors, their plans and the country's entries. Never throws — a failed read is an empty
 *  page (HatchGrab alone), logged. */
async function comparisonData(code: string): Promise<{ competitors: Competitor[]; plans: CompetitorPlan[]; entries: ComparisonEntry[] }> {
  try {
    const [all, entries] = await Promise.all([servicePricingStore.listAll(), servicePricingStore.listEntries()])
    // competitor-check-1: a competitor that is not counted (a candidate, closed, not relevant) is never on a page.
    // global-players-1: except that a 'pos' competitor's entry (added automatically, unverified) reaches the page data so an
    // ADMIN sees it — lib/comparison.ts still shows it publicly only once it is counted AND verified.
    const counted = new Set(all.competitors.map(competitorOut).filter(c => isCountedCompetitor(c) || isPendingPos(c)).map(c => c.id))
    const mine = entries.map(entryOut).filter(e => e.countryCode === code && counted.has(e.competitorId))
    const ids = new Set(mine.map(e => e.competitorId))
    return {
      competitors: all.competitors.map(competitorOut).filter(c => ids.has(c.id)),
      plans: all.plans.map(planOut).filter(p => ids.has(p.competitorId) && p.countryCode === code),
      entries: mine,
    }
  } catch (e) {
    console.error('[comparison] could not read the comparison data:', e instanceof Error ? e.message : e)
    return { competitors: [], plans: [], entries: [] }
  }
}

/** Everything lib/comparison.ts needs for one country, or null when the country has no comparison address. */
export async function comparisonPage(code: string, flags?: ComparisonFlags): Promise<ComparisonInput | null> {
  const key = code.toUpperCase()
  const settings = await getCountrySettings(key)
  const path = comparisonPath(key, settings.locale)
  if (!path) return null
  const [catalog, data, f] = await Promise.all([getPlanCatalog(), comparisonData(key), flags ? Promise.resolve(flags) : comparisonFlagsOf(key)])
  const page = HATCHGRAB_ORIGIN + path
  let countryName = settings.name
  try { countryName = new Intl.DisplayNames([settings.locale], { type: 'region' }).of(key) ?? settings.name } catch { /* the row's name */ }
  return {
    settings, countryName, catalog: localizePlans(catalog, settings.locale), flags: f, ...data,
    urls: {
      page, home: HATCHGRAB_ORIGIN + countryPagePath(key, 'landing'), features: HATCHGRAB_ORIGIN + countryPagePath(key, 'features'),
      md: `${page}.md`, json: `${page}.json`, contact: HATCHGRAB_ORIGIN + contactHref('general'),
    },
    today: new Date().toISOString().slice(0, 10),
  }
}

/**
 * 🔴 THE ONE VISIBILITY RULE, for the page and both twins. Null = 404:
 *   • the segment is not a country address, or its language has no comparison page, or the section/slug is not the
 *     country's own (comparison.path in its messages);
 *   • comparison_status 'off' — for everyone, admins included (the page does not exist);
 *   • 'admin' — for everyone but a verified admin (`isAdmin` is lib/auth/admin.ts, asked only then).
 * 'live' is public. The host check (HatchGrab only) is the caller's, before this.
 */
export async function resolveComparison(segment: string, section: string, slug: string, isAdmin: () => Promise<boolean>):
  Promise<{ input: ComparisonInput; flags: ComparisonFlags; admin: boolean } | null> {
  const code = Object.entries(COUNTRY_PATH_SEGMENTS).find(([, s]) => s === segment)?.[0]
  if (!code) return null
  const flags = await comparisonFlagsOf(code)
  if (flags.status === 'off') return null
  const admin = await isAdmin()
  if (flags.status === 'admin' && !admin) return null
  const input = await comparisonPage(code, flags)
  if (!input || input.urls.page !== `${HATCHGRAB_ORIGIN}/${segment}/${section}/${slug}`) return null
  return { input, flags, admin }
}

/** The footer's "Vergleich" column for a country's own pages (components/landing/LandingFooter.tsx): 'live' → in the
 *  server HTML; 'admin' → in an admin's browser only; 'off', no address, or no comparison language → undefined. Never throws. */
export async function comparisonFooter(code: string, locale: string): Promise<import('@/components/landing/LandingFooter').FooterComparison | undefined> {
  try {
    const f = await comparisonFlagsOf(code)
    if (f.status === 'off') return undefined
    const path = comparisonPath(code, locale)
    if (!path) return undefined
    const t = comparisonT(locale)
    return { mode: f.status, href: path, heading: t('footer.heading'), link: t('footer.link') }
  } catch { return undefined }
}

/** The live comparison pages (sitemap, /llms.txt): address, twins, language and the newest check date the PUBLIC page
 *  shows (lib/comparison.ts, public view). Never throws — a page that cannot be built is left out and logged. */
export async function liveComparisonPages(): Promise<(import('@/lib/llms-text').LlmsComparison & { code: string; locale: string })[]> {
  const out: (import('@/lib/llms-text').LlmsComparison & { code: string; locale: string })[] = []
  for (const code of await liveComparisonCodes()) {
    try {
      const input = await comparisonPage(code)
      if (!input) continue
      const v = buildComparison(input, comparisonT(input.settings.locale), { admin: false, publicView: true })
      let language = input.settings.locale
      try { language = new Intl.DisplayNames(['en'], { type: 'language' }).of(input.settings.locale.split('-')[0]) ?? language } catch { /* the code */ }
      out.push({ code, locale: input.settings.locale, country: input.settings.name, language, url: input.urls.page, md: input.urls.md, json: input.urls.json, checked: v.checkedOn })
    } catch (e) { console.error(`[comparison] ${code} left out of the sitemap and llms.txt:`, e instanceof Error ? e.message : e) }
  }
  return out
}
