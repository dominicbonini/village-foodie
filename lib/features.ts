export type Plan = 'starter' | 'pro' | 'max' | 'trial'

export type Feature =
  // Core — all plans
  | 'discovery_map'
  | 'web_dashboard'
  | 'ipad_kds'
  | 'qr_menu'
  | 'meal_deals'
  | 'upsells'
  | 'walkup_orders'
  | 'online_ordering_pay_at_hatch'
  | 'sold_out_toggle'
  | 'stock_countdown'
  // Pro
  | 'offline_protection'
  | 'online_payments'
  | 'advance_preordering'
  | 'time_slot_selection'
  | 'smart_batch_pacing'
  | 'auto_accept'
  | 'instagram_messenger_replies'
  // Max
  | 'ticket_printing'
  | 'multi_device_kds'
  | 'cook_screen'
  | 'whatsapp_replies'

const PRO_FEATURES: Feature[] = [
  'discovery_map',
  'web_dashboard',
  'ipad_kds',
  'qr_menu',
  'meal_deals',
  'upsells',
  'walkup_orders',
  'sold_out_toggle',
  'stock_countdown',
  'offline_protection',
  'online_payments',
  'advance_preordering',
  'time_slot_selection',
  'smart_batch_pacing',
  'auto_accept',
  'instagram_messenger_replies',
]

// Single source of truth — what each plan includes
export const PLAN_FEATURES: Record<Plan, Set<Feature>> = {
  starter: new Set([
    'discovery_map',
    'web_dashboard',
    'ipad_kds',
    'qr_menu',
    'meal_deals',
    'upsells',
    'walkup_orders',
    'online_ordering_pay_at_hatch',
    'sold_out_toggle',
    'stock_countdown',
  ]),
  pro: new Set(PRO_FEATURES),
  max: new Set([
    ...PRO_FEATURES,
    'ticket_printing',
    'multi_device_kds',
    'cook_screen',
    'whatsapp_replies',
  ]),
  // Trial = full Max access, valid only while trial_expires_at is in the future
  trial: new Set([
    ...PRO_FEATURES,
    'ticket_printing',
    'multi_device_kds',
    'cook_screen',
    'whatsapp_replies',
  ]),
}

// Base check — plan tier only, no overrides
export function hasFeature(plan: Plan, feature: Feature): boolean {
  if (plan === 'trial') {
    // Trial with no expiry context is treated as active — callers that have
    // expiry info should use hasFeatureWithContext instead
    return PLAN_FEATURES.trial.has(feature)
  }
  return PLAN_FEATURES[plan]?.has(feature) ?? false
}

// Full check — respects feature_overrides and trial expiry
export function canAccess(
  plan: Plan,
  feature: Feature,
  featureOverrides: Record<string, boolean> = {},
  trialExpiresAt: string | null = null
): boolean {
  // Per-truck override wins over everything
  if (feature in featureOverrides) {
    return featureOverrides[feature] === true
  }

  // Trial plan: check expiry before granting Pro features
  if (plan === 'trial') {
    if (!trialExpiresAt) return false
    if (new Date(trialExpiresAt) <= new Date()) return false
    return PLAN_FEATURES.trial.has(feature)
  }

  return PLAN_FEATURES[plan]?.has(feature) ?? false
}

export function getPlanFeatures(plan: Plan): Set<Feature> {
  return PLAN_FEATURES[plan] ?? PLAN_FEATURES.starter
}

// Plan display metadata — for upgrade prompts
export const PLAN_META: Record<Plan, {
  name: string
  price: string
  description: string
}> = {
  starter: {
    name: 'Starter',
    price: 'Free',
    description: 'Weekend traders & simple walk-up pitches',
  },
  pro: {
    name: 'Pro',
    price: '£29/mo',
    description: 'Busy trucks scaling online pre-orders',
  },
  max: {
    name: 'Max',
    price: '£49/mo',
    description: 'High-volume operations & festivals',
  },
  trial: {
    name: 'Trial',
    price: 'Free trial',
    description: 'Pro features, time-limited',
  },
}

// Which plan is needed for a given feature
export function requiredPlan(feature: Feature): Plan {
  if (PLAN_FEATURES.starter.has(feature)) return 'starter'
  if (PLAN_FEATURES.pro.has(feature)) return 'pro'
  return 'max'
}
