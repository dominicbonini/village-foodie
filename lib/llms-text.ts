// lib/llms-text.ts — the /llms.txt body (ai-search-1, 21 October 2026; docs/ai-search-1-report.md). PURE: the route
// (app/llms.txt/route.ts) passes the switched-on countries and the plan catalogue; scripts/ai-search-1.cjs passes fixtures.
// The format is llmstxt.org's — an H1, a one-line summary in a blockquote, then sections of plain facts and links.
// ⛔ NO CLAIM THE SITE DOES NOT ALREADY MAKE: every sentence is the pricing section's or the landing's own, in plain text,
// and every figure is read from the data the pricing cards render.
// ── faq-2-seo-geo-2 B4 (2 November 2026, docs/faq-2-seo-geo-2-report.md) ─────────────────────────────────────────────────────
//   • EVERY COUNTRY'S LINES IN ENGLISH, IN THE SIDE-BY-SIDE FORM (35.al-2): amounts in the international form written the
//     English way (englishMoney: "€29", "SEK 329", "A$39" — never "29 €" or "0,99 %"), percentages in English, and the card
//     sentence in English (the pricing footnote's English frame, the country's English name).
//   • A short "Features" section — the landing's own tiles, in English (landing.does.*).
//   • The English FAQ — the published questions as the UK page shows them (lib/faq/public.ts landingFaq, resolved for GB; the
//     GB home form is the international form for GBP), passed in by the route. Nothing invented.
import type { CountrySettings } from '@/lib/country-settings-types'
import { intlMoneyFormatOf } from '@/lib/country-settings-types'
import { feeLabel, type MoneyFormat } from '@/lib/money-format'
import { cardFees } from '@/lib/card-fees'
import { isEnglish } from '@/lib/i18n/locales'
import { WHATSAPP_LIVE } from '@/lib/whatsapp-live'
import type { PublicFaq } from '@/lib/faq/public'
import '@/lib/i18n/catalog/landing'
import type { PlanCatalog } from '@/lib/plans'
import { offerPlans, offerTrialMonths, offerFallback, type OfferPlan } from '@/lib/plan-offer'
import { formatAmount, formatWholeAmount, pctLabel } from '@/lib/money-format'
import { HATCHGRAB_ORIGIN, MARKETING_COUNTRY, countryPagePath } from '@/lib/marketing-country'
import { TERMS_PATH, PRIVACY_PATH } from '@/lib/legal'
import { BRANDS } from '@/lib/brand'
import { COMPANY } from '@/lib/company'
import { ABOUT_PATH } from '@/lib/about'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/pricing'

/** compare-de-1 (24 October 2026): a LIVE comparison page — /llms.txt lists it under "Comparisons" (only while live). */
export interface LlmsComparison { country: string; language: string; url: string; md: string; json: string; checked: string }

/** B4: the international form (lib/country-settings-types.ts intlMoneyFormatOf), written the English way. */
const englishMoney = (c: CountrySettings): MoneyFormat => ({ ...intlMoneyFormatOf(c), locale: 'en' })
/** B4: the card sentence in English — the pricing footnote in the country's own English where it is an English country (its
 *  "in the UK" / "in Ireland" / "EFTPOS"), otherwise the English footnote with the country's English name ("in Germany", and
 *  "in the Netherlands" where an English name takes the article). Every figure in the international form. */
function cardSentence(c: CountrySettings): string {
  const cardFee = feeLabel(cardFees(c).online, englishMoney(c))
  const own = isEnglish(c.locale)
  const t = translatorFor(own ? c.locale : 'en-IE', 'pricing')   // en-IE's frame is "in {country}" — no article
  const article = !own && /^(United\b|Netherlands$|Philippines$)|\b(Republic|Kingdom|States|Emirates|Islands)$/.test(c.name)
  const country = own ? (c.shortName ?? c.name) : article ? `the ${c.name}` : c.name
  return t('footnote', { cardFee, country }).replace(/^\*\s*/, '')
}

/** The llms.txt body for these switched-on countries — pure, so the harness builds it from fixtures. `faq` (B4): the English FAQ
 *  as the UK page shows it, or nothing. */
export function llmsText(countries: CountrySettings[], catalog: PlanCatalog, comparisons: LlmsComparison[] = [], faq: PublicFaq | null = null): string {
  const name = BRANDS.HATCHGRAB.name
  const url = (cc: string, page: 'landing' | 'features' | 'compare' | 'faq') => HATCHGRAB_ORIGIN + (countryPagePath(cc, page) ?? '')
  const months = offerTrialMonths(catalog)
  const L: string[] = []
  L.push(`# ${name}`, '')
  L.push(`> ${name} is online ordering, pre-orders and a kitchen screen for food trucks and mobile catering: customers order ahead and choose a collection time, and the truck sees every order on one screen.`, '')
  L.push('## Who it is for', '')
  L.push(`Food truck and mobile catering operators. Available in: ${countries.map(c => c.name).join(', ')}.`, '')

  // B4: the landing's own feature tiles, in English (rich-text tags dropped).
  const tl = translatorFor('en-GB', 'landing')
  const plain = (key: string) => (tl.markup as unknown as (k: string, v: Record<string, (c: string) => string>) => string)(key, { soon: c => c, b: c => c }).replace(/<[^>]+>/g, '').trim()
  L.push('## Features', '')
  for (const [title, body] of [['slotsTitle', 'slotsBody'], ['capacityTitle', 'capacityBody'], ['devicesTitle', 'devicesBody'], ['postsTitle', 'postsBody'],
    WHATSAPP_LIVE ? ['whatsappTitle', 'whatsappBody'] : ['whatsappSoonTitle', 'whatsappSoonBody'], ['offlineTitle', 'offlineBody']] as const)
    L.push(`- ${plain(`does.${title}`).replace(/\.$/, '')}: ${plain(`does.${body}`)}`)
  L.push('')

  L.push('## Plans and prices', '')
  for (const c of countries) {
    // native-prices: one document, every switched-on country — the INTERNATIONAL form, so each price names its currency (A$39, NZ$49).
    // B4: written the English way for every country (englishMoney).
    const money = englishMoney(c)
    const plans = offerPlans(catalog, c.countryCode)
    if (!plans.length) continue
    L.push(`### ${c.name} (${c.currency})`, '')
    for (const p of plans) L.push(`- ${p.plan.name}: ${formatAmount(p.monthlyMinor, money)} per truck per month. ${feeSentence(p, money)}`)
    // The pricing section's own footnote (it also says walk-up orders carry no HatchGrab fee), in English (B4), its leading "* " dropped.
    L.push(`- ${cardSentence(c)}`)
    L.push(`- Details: ${url(c.countryCode, 'landing')}#pricing`, '')
  }

  const fees = [...new Set(countries.flatMap(c => offerPlans(catalog, c.countryCode).filter(p => p.feeBps > 0).map(p => pctLabel(p.feeBps / 100, { locale: 'en-GB' }))))]
  if (fees.length) {
    L.push(`## The ${name} fee`, '')
    L.push(`The ${name} fee is ${fees.join(' or ')} of online card orders, on the plans that charge one (see each plan above). Plans with an allowance charge it only above the online orders included each month. It never applies to walk-up orders.`, '')
  }

  if (months !== null && countries.length) {
    // The plan a trial falls back to is one plan for every country; "no monthly fee" only where it is free in all of them.
    // world-countries-1 (31 October 2026): a country may name its OWN trial-end plan (Unlimited where it is the only plan offered).
    // The sentence names the plan most countries move to, exactly as before; the others follow, by plan, with their countries.
    const fbs = countries.map(c => ({ c, fb: offerFallback(catalog, c.countryCode) }))
    const byPlan = new Map<string, typeof fbs>()
    for (const x of fbs) byPlan.set(x.fb.plan.key, [...(byPlan.get(x.fb.plan.key) ?? []), x])
    const groups = [...byPlan.values()].sort((a, b) => b.length - a.length)
    const main = groups[0]
    const others = groups.slice(1).map(g => ` In ${g.map(x => x.c.name).join(', ')}, a truck moves to ${g[0].fb.plan.name}.`).join('')
    L.push('## Free trial', '')
    L.push(`The first ${months === 1 ? 'month is' : `${months} months are`} completely free, with every feature unlocked. When the trial ends, a truck moves to ${main[0].fb.plan.name}${main.every(x => x.fb.free) ? ' (no monthly fee)' : ''} unless it chooses a plan.${others} No card to start, no contract, cancel anytime.`, '')
  }

  L.push('## Countries', '')
  for (const c of countries) L.push(`- ${c.name}: ${url(c.countryCode, 'landing')}`)
  L.push('')
  // compare-de-1: the comparison pages, in English, only those that are live (app/llms.txt/route.ts passes them).
  if (comparisons.length) {
    L.push('## Comparisons', '')
    L.push(`Food-truck ordering systems compared on features and published prices, each fact checked on the vendor's own website. ${name} publishes these pages and is one of the tools compared.`, '')
    for (const c of comparisons) L.push(`- ${c.country} (in ${c.language}, checked ${c.checked}): ${c.url} — Markdown: ${c.md} — JSON: ${c.json}`)
    L.push('')
  }
  // B4: the English FAQ, as the UK page shows it (published, checked, resolved for GB).
  if (faq?.length) {
    L.push('## Frequently asked questions', '')
    // faq-4: the FAQ has its own page; the UK one, linked, with the English list kept below.
    L.push(`FAQ page: ${url(MARKETING_COUNTRY, 'faq')}`, '')
    for (const sec of faq) {
      L.push(`### ${sec.title}`, '')
      for (const q of sec.items) L.push(`**${q.q}**`, '', q.a, '')
    }
  }
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
function feeSentence(p: OfferPlan, money: MoneyFormat): string {
  const fee = pctLabel(p.feeBps / 100, { locale: 'en-GB' })   // B4: English for every country
  if (p.shape === 'feeOnly') return `${fee} on online card orders.`
  if (p.shape === 'included') return `First ${formatWholeAmount(p.includedMinor as number, money)} of online orders included each month, then ${fee} on online card orders.`
  return `No ${BRANDS.HATCHGRAB.name} fee on online orders.`
}
