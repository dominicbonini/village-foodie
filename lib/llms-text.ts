// lib/llms-text.ts — the /llms.txt body (ai-search-1, 21 October 2026; docs/ai-search-1-report.md). PURE: the route
// (app/llms.txt/route.ts) passes the switched-on countries and the plan catalogue; scripts/ai-search-1.cjs passes fixtures.
// The format is llmstxt.org's — an H1, a one-line summary in a blockquote, then sections of plain facts and links.
// ⛔ NO CLAIM THE SITE DOES NOT ALREADY MAKE: every sentence is the pricing section's or the landing's own, in plain text,
// and every figure is read from the data the pricing cards render.
import type { CountrySettings } from '@/lib/country-settings-types'
import { intlMoneyFormatOf } from '@/lib/country-settings-types'
import type { PlanCatalog } from '@/lib/plans'
import { offerPlans, offerTrialMonths, offerFallback, type OfferPlan } from '@/lib/plan-offer'
import { formatAmount, formatWholeAmount, pctLabel } from '@/lib/money-format'
import { cardFeeOnlineLabel } from '@/lib/card-fees'
import { HATCHGRAB_ORIGIN, countryPagePath } from '@/lib/marketing-country'
import { TERMS_PATH, PRIVACY_PATH } from '@/lib/legal'
import { BRANDS } from '@/lib/brand'
import { COMPANY } from '@/lib/company'
import { ABOUT_PATH } from '@/lib/about'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/pricing'

/** The llms.txt body for these switched-on countries — pure, so the harness builds it from fixtures. */
export function llmsText(countries: CountrySettings[], catalog: PlanCatalog): string {
  const name = BRANDS.HATCHGRAB.name
  const url = (cc: string, page: 'landing' | 'features' | 'compare') => HATCHGRAB_ORIGIN + (countryPagePath(cc, page) ?? '')
  const months = offerTrialMonths(catalog)
  const L: string[] = []
  L.push(`# ${name}`, '')
  L.push(`> ${name} is online ordering, pre-orders and a kitchen screen for food trucks and mobile catering: customers order ahead and choose a collection time, and the truck sees every order on one screen.`, '')
  L.push('## Who it is for', '')
  L.push(`Food truck and mobile catering operators. Available in: ${countries.map(c => c.name).join(', ')}.`, '')

  L.push('## Plans and prices', '')
  for (const c of countries) {
    // native-prices: one document, every switched-on country — the INTERNATIONAL form, so each price names its currency (A$39, NZ$49).
    const money = intlMoneyFormatOf(c)
    const plans = offerPlans(catalog, c.countryCode)
    if (!plans.length) continue
    L.push(`### ${c.name} (${c.currency})`, '')
    for (const p of plans) L.push(`- ${p.plan.name}: ${formatAmount(p.monthlyMinor, money)} per truck per month. ${feeSentence(p, money, c.locale)}`)
    // The pricing section's own footnote (it also says walk-up orders carry no HatchGrab fee), in the country's words ("in the UK", "in Ireland"), its leading "* " dropped.
    L.push(`- ${translatorFor(c.locale, 'pricing')('footnote', { cardFee: cardFeeOnlineLabel(c), country: c.shortName ?? c.name }).replace(/^\*\s*/, '')}`)
    L.push(`- Details: ${url(c.countryCode, 'landing')}#pricing`, '')
  }

  const fees = [...new Set(countries.flatMap(c => offerPlans(catalog, c.countryCode).filter(p => p.feeBps > 0).map(p => pctLabel(p.feeBps / 100, { locale: 'en-GB' }))))]
  if (fees.length) {
    L.push(`## The ${name} fee`, '')
    L.push(`The ${name} fee is ${fees.join(' or ')} of online card orders, on the plans that charge one (see each plan above). Plans with an allowance charge it only above the online orders included each month. It never applies to walk-up orders.`, '')
  }

  if (months !== null && countries.length) {
    // The plan a trial falls back to is one plan for every country; "no monthly fee" only where it is free in all of them.
    const fbs = countries.map(c => offerFallback(catalog, c.countryCode))
    L.push('## Free trial', '')
    L.push(`The first ${months === 1 ? 'month is' : `${months} months are`} completely free, with every feature unlocked. When the trial ends, a truck moves to ${fbs[0].plan.name}${fbs.every(f => f.free) ? ' (no monthly fee)' : ''} unless it chooses a plan. No card to start, no contract, cancel anytime.`, '')
  }

  L.push('## Countries', '')
  for (const c of countries) L.push(`- ${c.name}: ${url(c.countryCode, 'landing')}`)
  L.push('')
  // about-page (22 October 2026): who runs it — the About page's own fact (lib/company.ts COMPANY.founder).
  L.push('## About', '')
  L.push(`${name} is run by its founder, ${COMPANY.founder.name}, from the UK.`, '')
  L.push('## Links', '')
  for (const c of countries) {
    L.push(`- ${c.name} — features and plans compared: ${url(c.countryCode, 'features')}`)
    L.push(`- ${c.name} — cost calculator: ${url(c.countryCode, 'compare')}`)
  }
  L.push(`- Terms: ${HATCHGRAB_ORIGIN}${TERMS_PATH}`)
  L.push(`- Privacy: ${HATCHGRAB_ORIGIN}${PRIVACY_PATH}`)
  L.push(`- About: ${HATCHGRAB_ORIGIN}${ABOUT_PATH}`)
  return L.join('\n') + '\n'
}

/** One plan's fee, in the pricing cards' own terms (lib/plan-offer.ts feeShape). */
function feeSentence(p: OfferPlan, money: { currency: string; locale: string }, locale: string): string {
  const fee = pctLabel(p.feeBps / 100, { locale })
  if (p.shape === 'feeOnly') return `${fee} on online card orders.`
  if (p.shape === 'included') return `First ${formatWholeAmount(p.includedMinor as number, money)} of online orders included each month, then ${fee} on online card orders.`
  return `No ${BRANDS.HATCHGRAB.name} fee on online orders.`
}
