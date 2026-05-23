import { canAccess, requiredPlan, PLAN_META, type Plan, type Feature } from '@/lib/features'

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
          {meta.name} · {meta.price} · {meta.description}
        </div>
      </div>
      <a
        href="/pricing"
        className="text-xs font-medium text-teal-600 hover:text-teal-700 whitespace-nowrap"
      >
        Upgrade →
      </a>
    </div>
  )
}
