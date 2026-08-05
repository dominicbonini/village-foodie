'use client'
import { canAccess, requiredPlan, PLAN_META, type Plan, type Feature } from '@/lib/features'
import { usePriceMask } from '@/components/PricingPolicy'
import { purchaseCtaAllowed } from '@/lib/commerce-policy'

interface FeatureGateProps {
  feature: Feature
  plan?: Plan | null
  overrides?: Record<string, boolean> | null
  trialExpiresAt?: string | null
  children?: React.ReactNode
  showUpgrade?: boolean
  upgradeMessage?: string
}

export function FeatureGate({
  feature,
  plan,
  overrides,
  trialExpiresAt,
  children,
  showUpgrade = true,
  upgradeMessage,
}: FeatureGateProps) {
  // 🔴 BEFORE the early returns — hooks cannot sit after a conditional return. This is also why the
  // truck arrives by CONTEXT rather than a prop: FeatureGate is shared, has no truck, and both of its
  // render sites would otherwise have to remember to pass one.
  const px = usePriceMask()

  if (canAccess(plan ?? 'starter', feature, overrides ?? {}, trialExpiresAt ?? null)) {
    return <>{children}</>
  }

  if (!showUpgrade) return null

  const needed = requiredPlan(feature)
  const meta = PLAN_META[needed]

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-slate-700">
          {upgradeMessage ?? `This feature requires the ${meta.name} plan`}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {meta.name} · {px(meta.price)} · {meta.description}
        </div>
      </div>
      {/* 🔴 iOS (App Store 3.1.1/3.1.3): the CTA goes, the EXPLANATION stays. The panel above still names
          the feature and the plan that carries it, which is information about what the plans include and is
          permitted; the link is a call to action pointing at a purchase surface and is not.
          ✅ Both render sites in app/manage/[token]/page.tsx inherit this automatically — the suppression
          lives here precisely so neither call site has to know about it, and a third one added later is
          compliant by default rather than by remembering.
          ⚠️ href repointed /pricing → ?tab=billing on ALL platforms: /pricing has never existed as a route,
          so this link has been a 404 on both render sites since it shipped. Billing already renders the
          full plan matrix, which is what this link always meant to reach. */}
      {purchaseCtaAllowed() && (
        <a
          href="?tab=billing"
          className="text-xs font-medium text-teal-600 hover:text-teal-700 whitespace-nowrap"
        >
          Upgrade →
        </a>
      )}
    </div>
  )
}
