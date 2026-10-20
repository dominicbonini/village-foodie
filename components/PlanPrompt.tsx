'use client'
// components/PlanPrompt.tsx — 🔴 THE ONE UPGRADE PROMPT (plan-features-config, Stage A2, 20 October 2026;
// docs/plan-features-config-report.md).
// Shown where a feature is off because of the truck's EFFECTIVE PLAN (lib/features.ts featureBlock === 'plan') — never
// for an override, which keeps the surface's own "switched off for your truck" wording. It names the first active public
// plan, in sort_order, that has the feature on (lib/plans.ts upgradePlanFor): "WhatsApp auto-replies are included on
// Pro." Everything in it is data: the feature's name (messages `planPrompt.features`), the plan's name, description and
// price (public.plans / public.plan_prices, priced by usePlanPriceLabel).
// ⚠️ THE STYLING IS THE OLD FeatureGate PROMPT'S, unchanged (the panel, the second line, the teal "Upgrade →").
// 🔴 iOS (App Store 3.1.1/3.1.3): the link goes, the explanation stays — `purchaseCtaAllowed()`.
import type { Feature } from '@/lib/features'
import type { PlanPromptPlan } from '@/lib/plans'
import { useT } from '@/lib/i18n/use-t'
import { manageTabHref } from '@/lib/manage-links'
import { purchaseCtaAllowed } from '@/lib/commerce-policy'
import { usePlanPriceLabel } from '@/components/usePlanPriceLabel'
import '@/lib/i18n/catalog/planPrompt'

export function PlanPrompt({ feature, upgradeTo }: { feature: Feature; upgradeTo: PlanPromptPlan | null }) {
  const t = useT('planPrompt')
  const price = usePlanPriceLabel()
  const words = { feature: t(`features.${feature}.name` as never), many: t(`features.${feature}.many` as never) }
  const priceLabel = upgradeTo ? price(upgradeTo.monthlyMinor) : null
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-slate-700">
          {upgradeTo ? t('includedOn', { ...words, plan: upgradeTo.name }) : t('notOnPlan', words)}
        </div>
        {upgradeTo && (
          <div className="text-xs text-slate-400 mt-0.5">
            {priceLabel
              ? t('planLine', { plan: upgradeTo.name, price: priceLabel, description: upgradeTo.description })
              : t('planLineNoPrice', { plan: upgradeTo.name, description: upgradeTo.description })}
          </div>
        )}
      </div>
      {upgradeTo && purchaseCtaAllowed() && (
        <a href={manageTabHref('billing')} className="text-xs font-medium text-teal-600 hover:text-teal-700 whitespace-nowrap">
          {t('upgrade')}
        </a>
      )}
    </div>
  )
}
