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

  // 🔴 MADE CONSISTENT WITH canAccess (Y2d). This used to read
  //   `plan === 'trial' && (!trialExpiresAt || <past>)` — i.e. a NULL expiry counted as EXPIRED, the
  // exact opposite of what canAccess now means by it. Left alone it would have contradicted the gate
  // it sits beside: `can()` granting every feature to a self-serve operator while `isTrialExpired`
  // told the same component their trial was over.
  // ⚠️ NULL now means NOT STARTED, so it is not expired. A PAST date still is — matching canAccess's
  // untouched expired branch.
  // ⚠️ This flag currently has NO consumer (useFeatures is imported once, in the KDS, which
  // destructures only `can`), so the fix changes no behaviour today. It is made anyway: a shared hook
  // carrying a definition that contradicts the gate next to it is a trap set for the first thing that
  // reads it.
  const isTrialExpired = plan === 'trial'
    && !!trialExpiresAt && new Date(trialExpiresAt) < new Date()

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
