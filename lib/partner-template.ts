// lib/partner-template.ts — partners-2 (16 November 2026, docs/partners-2-report.md): a partner template's merge fields.
// Pure. The template itself is an ordinary outreach_templates row (slug `partner-<assoc|dir>-<step>-<language>`, created only
// after Dominic signs the wording off); its {{signature}} and {{opt_out}} lines are expanded exactly as truck outreach expands
// them (lib/outreach-doc.ts docFromTemplateText), so the opt-out works the same way: reply "no thanks".
//
// Fields: {{contact_name}} (with a fallback, {{contact_name|there}}, as none of the imported organisations has a name yet), {{org}},
// {{code}}, {{deal}}, {{commission}}. A field with no value is REFUSED, never sent blank (literalTokenRefusal would otherwise
// catch a raw "{{…}}" too late). A US partner's email ends with HatchGrab's postal address (CAN-SPAM).
// partners offer (16 November 2026): + {{features_url}} — the partner's OWN COUNTRY's features page (/fr/features, /us/features…).
export const PARTNER_FIELDS = ['contact_name', 'org', 'code', 'deal', 'commission', 'features_url'] as const
export type PartnerField = (typeof PARTNER_FIELDS)[number]

export function renderPartnerText(text: string, values: Partial<Record<PartnerField, string>>):
  { ok: true; text: string } | { ok: false; missing: string[] } {
  const missing: string[] = []
  // {{field}} or {{field|fallback}} — the fallback (in the template's own language, e.g. {{contact_name|there}} /
  // {{contact_name|à toute l'équipe}}) is used when the field has no value; without one, a missing value is refused.
  const out = text.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (whole, name: string, fallback: string | undefined) => {
    if (!(PARTNER_FIELDS as readonly string[]).includes(name)) return whole            // signature / opt_out: expanded later
    const v = values[name as PartnerField]
    if (v === undefined || v === null || v === '') {
      if (fallback !== undefined && fallback.trim()) return fallback.trim()
      missing.push(name); return whole
    }
    return v
  })
  return missing.length ? { ok: false, missing: [...new Set(missing)] } : { ok: true, text: out }
}

/** The body with the postal address line a US email needs, placed before the opt-out line when there is one. */
export function withPostalAddress(body: string, address: string | null, countryCode: string | null): string {
  if (countryCode !== 'US' || !address) return body
  const at = body.search(/\{\{\s*opt_out\s*\}\}/)
  return at >= 0 ? `${body.slice(0, at)}${address}\n\n${body.slice(at)}` : `${body}\n\n${address}`
}

/** "20% of plan fees in year 1, 10% in year 2" — the commission in English (Admin). Emails use offerValues below, in their language. */
export function commissionText(pctYear1: number, pctYear2: number): string {
  const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))
  return pctYear2 > 0 ? `${n(pctYear1)}% of plan fees in year 1 and ${n(pctYear2)}% in year 2` : `${n(pctYear1)}% of plan fees for the first year`
}

// ── partners offer (16 November 2026): the email's offer, in the email's language ──────────────────────────────────────────
// {{deal}} and {{commission}} come from the partner's OWN code (its offer); the words around the numbers are each language's
// (lib/partner-offer-phrases.ts, generated from docs/partners-3/templates/<lang>.json with the templates themselves).
import { PARTNER_PHRASES, type OfferPhrases } from '@/lib/partner-offer-phrases'
import { dealArgs, formatMinor } from '@/lib/partner-codes'
import { countryPagePath, HATCHGRAB_ORIGIN } from '@/lib/marketing-country'

/** The partner's own country's features page: https://www.hatchgrab.com/fr/features; a country with no address → /features. */
export function featuresUrlFor(countryCode: string | null | undefined): string {
  return `${HATCHGRAB_ORIGIN}${(countryCode && countryPagePath(countryCode, 'features')) || '/features'}`
}

const pick = (forms: { one: string; other: string }, n: number) => (n === 1 ? forms.one : forms.other)
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (w, k: string) => (k in v ? String(v[k]) : w))

export interface OfferForText { deal_type: 'extra_trial_months' | 'percent_off' | 'fixed_price'; deal_value: number; deal_months: number | null
  deal_plan_key: string | null; deal_currency: string | null; pct_year1: number; pct_year2: number; code: string }

/**
 * The merge values an offer gives a template in `lang` (en / fr / nl / de / es / it / sv — anything else is English): {{code}},
 * {{deal}}, {{commission}} and {{features_url}}. `planName` names a plan key in that language (Pro is never translated).
 * `moneyLocale` formats a fixed price (e.g. fr-BE).
 */
export function offerValues(offer: OfferForText, lang: string | null | undefined, countryCode: string | null | undefined,
  planName: (key: string) => string, moneyLocale?: string): { code: string; deal: string; commission: string; features_url: string } {
  const ph: OfferPhrases = PARTNER_PHRASES[(lang || 'en').toLowerCase()] ?? PARTNER_PHRASES.en
  const d = dealArgs({ dealType: offer.deal_type, dealValue: offer.deal_value, dealMonths: offer.deal_months, dealPlanKey: offer.deal_plan_key, dealCurrency: offer.deal_currency })
  const deal = d.kind === 'extraMonths' ? fill(pick(ph.deal_extra_months, d.months), { n: d.months })
    : d.kind === 'fixedPrice' ? fill(pick(ph.deal_fixed_price, d.months), { plan: planName(d.planKey), price: formatMinor(d.priceMinor, d.currency, moneyLocale || `${(lang || 'en').toLowerCase()}-${(countryCode || 'GB').toUpperCase()}`), months: d.months })
    : d.planKey ? fill(pick(ph.deal_percent_off_plan, d.months), { pct: d.pct, plan: planName(d.planKey), months: d.months })
    : fill(pick(ph.deal_percent_off_any, d.months), { pct: d.pct, months: d.months })
  const y1 = Number(offer.pct_year1), y2 = Number(offer.pct_year2)
  const num = new Intl.NumberFormat((lang || 'en').toLowerCase(), { maximumFractionDigits: 1 })   // 12.5 / 12,5
  const pct = (x: number) => num.format(x)
  const commission = y2 > 0 ? fill(ph.commission_two_years, { y1: pct(y1), y2: pct(y2) }) : fill(ph.commission_one_year, { y1: pct(y1) })
  return { code: offer.code, deal, commission, features_url: featuresUrlFor(countryCode) }
}
