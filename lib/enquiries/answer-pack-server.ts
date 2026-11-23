// lib/enquiries/answer-pack-server.ts — the answer pack's inputs, read through THE SAME READERS THE PRICING, FEATURES AND FAQ PAGES USE
// (enquiries-backend-1, 23 November 2026). SERVER ONLY, and READ ONLY: getCountrySettings, getPlanCatalog and faqPage are called, never
// changed (lib/country-settings.ts, lib/plans-server.ts, lib/faq/public.ts are untouched by this work), and the plan and table helpers
// (lib/plan-offer.ts, lib/feature-table.ts) are only called. Imported lazily by the reply poll, only when intake is switched on.
import { getCountrySettings } from '@/lib/country-settings'
import { getPlanCatalog } from '@/lib/plans-server'
import { faqPage } from '@/lib/faq/public'
import { offerPlans, offerTrialPlan, offerTrialMonths, tableColumns, tableCell } from '@/lib/plan-offer'
import { FEATURE_TABLE } from '@/lib/feature-table'
import { planMoneyFormatOf, offersOnlineCardPayments } from '@/lib/country-settings-types'
import { formatMinor } from '@/lib/money-format'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/planFeatures'
import type { PackInputs } from '@/lib/enquiries/answer-pack'

const pct = (bps: number) => `${(bps / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`

/** Everything the pack may hold for one country. A country we cannot read gives a pack with no prices (the draft is then flagged). */
export async function readPackInputs(country: string | null): Promise<PackInputs> {
  const catalog = await getPlanCatalog()
  const t = translatorFor('en-GB', 'planFeatures')
  const featureName = (id: string) => { try { return t(`row.${id}.name` as never) } catch { return id } }
  const empty: PackInputs = { country, countryName: null, language: null, plans: [], trial: { months: offerTrialMonths(catalog), planName: offerTrialPlan(catalog)?.name ?? null }, cardFeeOnline: null, features: [], faq: [] }
  if (!country) return { ...empty, features: FEATURE_TABLE.map(r => ({ name: featureName(r.id), comingSoon: !!r.comingSoon, plans: [] })) }
  let settings
  try { settings = await getCountrySettings(country) } catch { return { ...empty, features: FEATURE_TABLE.map(r => ({ name: featureName(r.id), comingSoon: !!r.comingSoon, plans: [] })) } }
  const money = planMoneyFormatOf(settings)
  const plans = offerPlans(catalog, country).map(p => ({
    name: p.plan.name,
    monthly: formatMinor(p.monthlyMinor, money),
    includedOnline: p.includedMinor === null ? 'unlimited' : p.includedMinor > 0 ? formatMinor(p.includedMinor, money) : null,
    feePercent: p.feeBps > 0 ? pct(p.feeBps) : null,
    extraVan: p.price.extraVanMonthlyMinor ? formatMinor(p.price.extraVanMonthlyMinor, money) : null,
  }))
  const columns = tableColumns(catalog, country)
  const features = FEATURE_TABLE.map(r => ({
    name: featureName(r.id),
    comingSoon: !!r.comingSoon,
    plans: columns.filter(c => tableCell(catalog, r, c) === 'on').map(c => c.plan.name),
  }))
  const cardFeeOnline = offersOnlineCardPayments(settings)
    ? `${settings.cardFeeOnlinePct.toLocaleString(settings.locale)}%${settings.cardFeeOnlineFixedMinor ? ` + ${formatMinor(settings.cardFeeOnlineFixedMinor, money)}` : ''}`
    : null
  const page = await faqPage(settings)
  const faq = (page?.sections ?? []).flatMap(s => s.items.map(i => ({ q: i.q, a: i.a })))
  return {
    country, countryName: settings.name, language: settings.locale, plans,
    trial: { months: offerTrialMonths(catalog), planName: offerTrialPlan(catalog)?.name ?? null },
    cardFeeOnline, features, faq,
  }
}
