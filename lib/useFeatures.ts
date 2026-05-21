import { canAccess, getPlanFeatures, PLAN_META, type Plan, type Feature } from './features'

interface TruckPlanContext {
  plan?: Plan | null
  feature_overrides?: Record<string, boolean> | null
  trial_expires_at?: string | null
}

export function useFeatures(truck: TruckPlanContext | null | undefined) {
  const plan: Plan = truck?.plan ?? 'starter'
  const overrides = truck?.feature_overrides ?? {}
  const trialExpiresAt = truck?.trial_expires_at ?? null

  const isTrialExpired = plan === 'trial'
    && (!trialExpiresAt || new Date(trialExpiresAt) < new Date())

  const trialDaysRemaining = plan === 'trial' && trialExpiresAt
    ? Math.max(0, Math.ceil(
        (new Date(trialExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ))
    : null

  return {
    plan,
    planMeta: PLAN_META[plan],
    isTrialExpired,
    trialDaysRemaining,
    can: (feature: Feature) => canAccess(plan, feature, overrides, trialExpiresAt),
  }
}
