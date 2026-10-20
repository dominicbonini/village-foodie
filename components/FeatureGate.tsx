'use client'
import type { Feature } from '@/lib/features'
import { useFeatures, type TruckFeatureContext } from '@/lib/useFeatures'
import { PlanPrompt } from '@/components/PlanPrompt'

/**
 * Shows `children` when the truck may use `feature`; otherwise says why (plan-features-config, Stage A2).
 * 🔴 ONE RESOLUTION ORDER (lib/features.ts): the per-truck override → the truck's EFFECTIVE plan's switch → allowed.
 *   • off because of the PLAN → the one upgrade prompt (components/PlanPrompt.tsx), naming the plan that has it;
 *   • off because of an OVERRIDE → `fallback` (nothing by default) — the surface's own "switched off" wording, never an
 *     upgrade, because no plan change would turn an override back on.
 */
interface FeatureGateProps {
  feature: Feature
  truck: TruckFeatureContext | null | undefined
  children?: React.ReactNode
  fallback?: React.ReactNode
}

export function FeatureGate({ feature, truck, children, fallback = null }: FeatureGateProps) {
  const access = useFeatures(truck)
  const block = access.block(feature)
  if (block === null) return <>{children}</>
  if (block === 'plan') return <PlanPrompt feature={feature} upgradeTo={access.upgradeTo(feature)} />
  return <>{fallback}</>
}
