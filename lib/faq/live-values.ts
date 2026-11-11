// lib/faq/live-values.ts — 🔴 THE FAQ'S LIVE VALUES ("tokens"): `{K.price}` in an English answer becomes each country's own
// figure, read from the plan data and the country's row (faq-1, 1 November 2026; docs/faq-1-report.md §2).
//
// PURE, SERVER-SAFE AND CLIENT-SAFE. Admin › FAQ runs it in the browser for the live check and the preview; the admin route
// runs the SAME code again before a publish (lib/admin/faq-actions.ts), so the two can never disagree.
//
// ⛔ NO PLAN KEY, NAME, PRICE, ALLOWANCE, FEE, TRIAL LENGTH OR COUNTRY IS WRITTEN HERE (35.aj-1, 35.ak-7). A plan token's key
// is looked up in the catalogue, so a plan added as data has its tokens at once; scripts/faq-1.cjs greps this folder for every
// public plan key and name. Every amount goes through the formatter the pricing section uses for that country
// (components/pricing/PricingSection.tsx): the home form (35.al-2), the currency's own decimals (JPY has none, 35.an-19).
//
// THE TOKENS
//   {K.name} {K.price} {K.included} {K.fee} {K.extraVan}   for any public plan key K offered in the country
//   {trial.months}  {trialEnd.name}  {trialEnd.price}  {card.fee}  {payAtTruck}  {countries}  {plansWith.F}
//   {apps.sentence}  {apps.offline}   phrases chosen by the country's app flags (faq.phrases.*)
import { offerPlans, offerTrialMonths, offerFallback } from '@/lib/plan-offer'
import { planByKey, planPriceFor, planAllowsFeature, type PlanCatalog } from '@/lib/plans'
import { localizePlans } from '@/lib/plan-names'
import { planMoneyFormatOf, type CountrySettings } from '@/lib/country-settings-types'
import { formatAmount, formatWholeAmount, pctLabel } from '@/lib/money-format'
import { cardFeeOnlineLabel } from '@/lib/card-fees'
import { priceText } from '@/lib/price-text'
import { PRICE_WORD } from '@/lib/price-words'
import { isFeature } from '@/lib/features'
import { translatorFor } from '@/lib/i18n/translator'
import { DEFAULT_LOCALE, isEnglish } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/faq'

/** One switched-on country, as the FAQ reads it. `apps`: the iPad AND the Android app are in this country's stores
 *  (country_settings.ios_app_available AND android_app_available — the flags the comparison pages read; Dominic, faq-1 Q1). */
export interface FaqCountry { settings: CountrySettings; apps: boolean }
/** Everything a token can read: the plan catalogue and the SWITCHED-ON countries (a switched-off country is never checked). */
export interface FaqWorld { catalog: PlanCatalog; countries: FaqCountry[] }
/** The stored text of one question (faq_items), as the resolver needs it. */
export interface FaqText { questionEn: string; answerEn: string; answerSinglePlanEn: string | null; showIn: string }

export type Problem =
  | { kind: 'unknown'; token: string }
  | { kind: 'notOffered'; token: string; planKey: string }
  | { kind: 'empty'; token: string }

/** The plan fields a plan token can ask for. */
export const PLAN_FIELDS = ['name', 'price', 'included', 'fee', 'extraVan'] as const
type PlanField = (typeof PLAN_FIELDS)[number]

/** A token's text between the braces: one name, or two joined by a dot. Anything else in braces is unknown. */
const TOKEN = /\{([^{}]*)\}/g
const NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)?$/

/** The tokens typed in a text, in order (each once) — `{K.price}` → 'K.price'. */
export function tokensIn(text: string): string[] {
  return [...new Set([...String(text ?? '').matchAll(TOKEN)].map(m => m[1]))]
}

/** Is a show_in value well formed? 'all' | 'apps' | 'plan:<plan key>' — the database CHECK holds the same rule. */
export const isShowIn = (v: unknown): v is string => typeof v === 'string' && (v === 'all' || v === 'apps' || /^plan:[a-z][a-z0-9_]*$/.test(v))

/** The language the words of a preview are in until faq-2: the country's own when it is English, else en-GB. */
export const previewLocaleOf = (s: Pick<CountrySettings, 'locale'>): string => (isEnglish(s.locale) ? s.locale : DEFAULT_LOCALE)

/** The plans offered in a country (public, priced and `offered` there), named in `locale`. */
function offered(world: FaqWorld, country: FaqCountry, locale: string) {
  return offerPlans(localizePlans(world.catalog, locale), country.settings.countryCode)
}

/** A list in the page's language: "A, B and C" (Intl.ListFormat, as /features joins plan names). */
const naturalList = (xs: string[], locale: string): string => new Intl.ListFormat(locale, { type: 'conjunction' }).format(xs)

/** A country's name in `locale`: the row's own (English) name on an English page, else Intl's name for the code. */
function countryName(s: CountrySettings, locale: string): string {
  if (isEnglish(locale)) return s.name
  try { return new Intl.DisplayNames([locale], { type: 'region' }).of(s.countryCode) || s.name } catch { return s.name }
}

type Value = { value: string } | { problem: Problem }

/** The tokens that are not plan tokens, by their full name. Each answers for one country, words in `locale`. */
const FIXED: Record<string, (world: FaqWorld, country: FaqCountry, locale: string, token: string) => Value> = {
  'trial.months': (world, _c, locale, token) => {
    const months = offerTrialMonths(world.catalog)
    return months === null ? { problem: { kind: 'empty', token } } : { value: new Intl.NumberFormat(locale).format(months) }
  },
  'trialEnd.name': (world, country, locale, token) => {
    try { return { value: offerFallback(localizePlans(world.catalog, locale), country.settings.countryCode).plan.name } }
    catch { return { problem: { kind: 'empty', token } } }
  },
  'trialEnd.price': (world, country, _l, token) => {
    try {
      const { plan } = offerFallback(world.catalog, country.settings.countryCode)
      const price = planPriceFor(world.catalog, plan.key, country.settings.countryCode)
      return price ? { value: formatAmount(price.monthlyMinor, planMoneyFormatOf(country.settings)) } : { problem: { kind: 'empty', token } }
    } catch { return { problem: { kind: 'empty', token } } }
  },
  // The footnote's own figure: `pricing.footnote` is "… (currently {cardFee} in the {country}) …" with cardFeeOnlineLabel.
  'card.fee': (_w, country) => ({ value: cardFeeOnlineLabel(country.settings) }),
  'payAtTruck': (_w, _c, locale) => ({ value: priceText(PRICE_WORD.payAtHatch, locale) }),
  'countries': (world, _c, locale, token) => {
    const names = world.countries.map(c => countryName(c.settings, locale)).sort((a, b) => a.localeCompare(b, locale))
    return names.length ? { value: naturalList(names, locale) } : { problem: { kind: 'empty', token } }
  },
  'apps.sentence': (_w, country, locale) => ({ value: country.apps ? translatorFor(locale, 'faq')('phrases.appsSentence') : '' }),
  'apps.offline': (_w, country, locale) => ({ value: translatorFor(locale, 'faq')(country.apps ? 'phrases.appsOffline' : 'phrases.webOffline') }),
}

/** All the token names the "i" lists, with what each one is. Plan tokens are listed per field (K = any plan key). */
export const TOKEN_HELP: [string, string][] = [
  ['{K.name}', "The plan's name"],
  ['{K.price}', 'Its monthly price, as the pricing section shows it'],
  ['{K.included}', 'Online orders included each month'],
  ['{K.fee}', 'Its fee on online orders, as a percentage'],
  ['{K.extraVan}', "An extra van's monthly price"],
  ['{trial.months}', 'How many months the free trial lasts'],
  ['{trialEnd.name}', 'The plan a truck moves to when the trial ends, in that country'],
  ['{trialEnd.price}', "That plan's monthly price"],
  ['{card.fee}', "Stripe's online card fee there, as the pricing footnote words it"],
  ['{payAtTruck}', '"Pay at Hatch" (UK) or "Pay at the truck"'],
  ['{countries}', 'Every switched-on country, as a list'],
  ['{plansWith.F}', 'The plans offered there with feature F switched on, as a list'],
  ['{apps.sentence}', 'A sentence about the iPad and Android app where they are in the stores; nothing elsewhere'],
  ['{apps.offline}', 'What keeps working without signal (the app where it is in the stores, else the web dashboard)'],
]

/** One token's value in one country, or why it has none. */
export function tokenValue(token: string, world: FaqWorld, country: FaqCountry, locale: string): Value {
  if (!NAME.test(token)) return { problem: { kind: 'unknown', token } }
  const fixed = FIXED[token]
  if (fixed) return fixed(world, country, locale, token)
  const [head, field] = token.split('.')
  if (head === 'plansWith') {
    if (!field || !isFeature(field)) return { problem: { kind: 'unknown', token } }
    const names = offered(world, country, locale).filter(p => planAllowsFeature(world.catalog, p.plan.key, field)).map(p => p.plan.name)
    return names.length ? { value: naturalList(names, locale) } : { problem: { kind: 'empty', token } }
  }
  // A plan token: the key must be a plan in the catalogue, and the field one of PLAN_FIELDS.
  if (!field || !(PLAN_FIELDS as readonly string[]).includes(field) || !planByKey(world.catalog, head)) return { problem: { kind: 'unknown', token } }
  const p = offered(world, country, locale).find(o => o.plan.key === head)
  if (!p) return { problem: { kind: 'notOffered', token, planKey: head } }
  const money = planMoneyFormatOf(country.settings)
  switch (field as PlanField) {
    case 'name': return { value: p.plan.name }
    case 'price': return { value: formatAmount(p.monthlyMinor, money) }
    case 'included': return p.includedMinor === null ? { problem: { kind: 'empty', token } } : { value: formatWholeAmount(p.includedMinor, money) }
    // PricingSection's feeLabel: the basis points as a percentage, in the country's locale.
    case 'fee': return { value: pctLabel(p.feeBps / 100, { locale: country.settings.locale }) }
    case 'extraVan': return { value: formatAmount(p.price.extraVanMonthlyMinor, money) }
  }
}

/** Does the question appear in this country at all? 'apps' = the apps are in its stores; 'plan:K' = K is offered there. */
export function shownIn(showIn: string, country: FaqCountry, world: FaqWorld): boolean {
  if (showIn === 'all') return true
  if (showIn === 'apps') return country.apps
  if (showIn.startsWith('plan:')) return offerPlans(world.catalog, country.settings.countryCode).some(p => p.plan.key === showIn.slice(5))
  return false
}

/** True where only one plan is offered — where the single-plan answer is used, when one is written. */
export const offersOnePlan = (country: FaqCountry, world: FaqWorld): boolean => offerPlans(world.catalog, country.settings.countryCode).length === 1

/** Which answer a country reads: the single-plan answer where one plan is offered and it is written, else the main one. */
export function answerFor(item: FaqText, country: FaqCountry, world: FaqWorld): { text: string; single: boolean } {
  const single = !!item.answerSinglePlanEn?.trim() && offersOnePlan(country, world)
  return single ? { text: item.answerSinglePlanEn as string, single: true } : { text: item.answerEn, single: false }
}

export interface Resolved { text: string; problems: Problem[]; omitted: string[] }

/** A text with every token filled for one country. A token with no value is left as typed and reported. A stray brace is an
 *  unknown token. Spaces left by a token that resolves to nothing are tidied. */
export function resolveText(text: string, world: FaqWorld, country: FaqCountry, locale: string): Resolved {
  const problems: Problem[] = []
  const omitted: string[] = []
  const filled = String(text ?? '').replace(TOKEN, (whole, token: string) => {
    const v = tokenValue(token, world, country, locale)
    if ('problem' in v) { problems.push(v.problem); return whole }
    if (v.value === '') omitted.push(token)
    return v.value
  })
  const rest = filled.replace(TOKEN, '')
  if (/[{}]/.test(rest)) problems.push({ kind: 'unknown', token: rest.includes('{') ? '{' : '}' })
  return { text: filled.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1').trim(), problems, omitted }
}

/** One question in one country: hidden there, or its answer filled (and whether it is the single-plan answer). */
export function resolveItem(item: FaqText, world: FaqWorld, country: FaqCountry, locale: string):
  { shown: false } | ({ shown: true; single: boolean } & Resolved) {
  if (!shownIn(item.showIn, country, world)) return { shown: false }
  const a = answerFor(item, country, world)
  return { shown: true, single: a.single, ...resolveText(a.text, world, country, locale) }
}
