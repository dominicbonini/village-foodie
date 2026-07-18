export type Plan = 'starter' | 'pro' | 'max' | 'trial' | 'tester' | 'demo'

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
  | 'branded_qr_code'
  | 'advanced_reporting'
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
  'branded_qr_code',
  'advanced_reporting',
  'whatsapp_replies',   // Pro+Max — moved from Max-only: a Pro truck was sold WhatsApp replies and the gate silently blocked it (canAccess('pro',…)===false)
]

const MAX_FEATURES: Feature[] = [
  ...PRO_FEATURES,   // includes whatsapp_replies now
  'ticket_printing',
  'multi_device_kds',
  'cook_screen',
]

const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]

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
  max: new Set(MAX_FEATURES),
  trial: new Set(TRIAL_FEATURES),
  tester: new Set(MAX_FEATURES),
  // Demo = prospect-facing SANDBOX. Mirrors TRIAL's feature profile (full product access — menu, schedule,
  // ordering screens, KDS preview — so a prospect can try everything before signup). Distinct from Tester
  // (internal). ⚠️ FUTURE (demo-feature build, NOT here): a Demo-plan truck must be fully walled off from
  // the public VF/HG discovery queries — its activity must never surface publicly.
  demo: new Set(TRIAL_FEATURES),
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

// Plan display metadata — THE SINGLE SOURCE for plan name/price/description across the whole app: upgrade
// prompts AND the pricing / billing / landing tables. lib/plan-features.ts DERIVES PLAN_PRICES +
// PLAN_DESCRIPTIONS from this — do NOT re-hardcode those strings anywhere; that divergence was the drift
// (three text mismatches had already crept in between the two copies).
export const PLAN_META: Record<Plan, {
  name: string
  price: string
  description: string
}> = {
  starter: { name: 'Starter', price: 'Free',       description: 'Weekend traders & walk-up pitches' },
  pro:     { name: 'Pro',     price: '£29/mo',     description: 'Busy trucks scaling pre-orders' },
  max:     { name: 'Max',     price: '£49/mo',     description: 'High-volume operations & festivals' },
  trial:   { name: 'Trial',   price: 'Free trial', description: 'All features included — Max tier + Pay at Hatch ordering' },
  tester:  { name: 'Tester',  price: 'Lifetime',   description: 'Pre-launch tester — full feature access, lifetime discount' },
  demo:    { name: 'Demo',    price: 'Demo',       description: 'Prospect sandbox — full trial before signup (never public)' },
}

// Maximum vans allowed per plan
export function maxVans(plan: Plan): number {
  if (plan === 'starter') return 1
  if (plan === 'pro') return 2
  return 999 // max / trial
}

// Which plan is needed for a given feature
export function requiredPlan(feature: Feature): Plan {
  if (PLAN_FEATURES.starter.has(feature)) return 'starter'
  if (PLAN_FEATURES.pro.has(feature)) return 'pro'
  return 'max'
}
