// lib/features.ts — WHICH FEATURES A TRUCK MAY USE (rewritten for plans-data-model, Stage A, 19 October 2026; per-plan
// switches added in plan-features-config, Stage A2, 20 October 2026 — docs/plan-features-config-report.md).
//
// 🔴 THE LIST OF CAPABILITIES LIVES HERE; WHICH PLAN HAS WHICH DOES NOT. `FEATURES` is the code's list of switchable
// capabilities. Whether a PLAN has one is data — public.plan_features, read through lib/plans.ts — and a feature with
// no row for a plan is ON. No plan name, tier or number is written in this file.
// 🔴 THE RESOLUTION ORDER, ONE FUNCTION (canAccess):
//   1. the per-truck OVERRIDE (trucks.feature_overrides) wins — `true` grants, any other value under the key denies;
//   2. else the truck's EFFECTIVE plan's switch (lib/plans.ts — an ended plan resolves to the expiry fallback, WITH ITS
//      switches);
//   3. else allowed.
// "Coming soon" is not decided here — it never was: unbuilt products are not Features, and their labels live with
// the surfaces (and lib/whatsapp-live.ts for WhatsApp).
// The old plan names and their frozen pricing display are deleted (Stage B, docs/pricing-pages-report.md).

/** 🔴 THE CODE'S LIST OF SWITCHABLE CAPABILITIES — the keys public.plan_features and trucks.feature_overrides may name. */
export const FEATURES = [
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
  'offline_protection',
  'online_payments',
  'advance_preordering',
  'time_slot_selection',
  'smart_batch_pacing',
  'auto_accept',
  'instagram_messenger_replies',
  'branded_qr_code',
  'advanced_reporting',
  'ticket_printing',
  'multi_device_kds',
  'cook_screen',
  'whatsapp_replies',
  'embed_schedule',
  'schedule_graphics',
  'event_types',
  'private_events',
] as const

export type Feature = (typeof FEATURES)[number]

/* ══ ⛔ TOMBSTONE · `places_posts_preview` — REMOVED AT LAUNCH (10 October 2026) ═══════════════════
   *
   * IT WAS A `Feature` IN NO PLAN SET AT ALL, held only through `trucks.feature_overrides`, and granted
   * to exactly one truck: test-kitchen ("Pizza Kitchen"). Its whole job was "is this surface finished
   * for this truck?" while Social media was being built — a second gate in front of the plan gate.
   *
   * 🔴 **SOCIAL MEDIA IS LAUNCHED, SO THE QUESTION IS GONE AND SO IS THE KEY.** Access follows the plan
   * now, through `schedule_graphics` below — the key the route's own comment already called *"may this
   * plan have social posts at all"*. ⛔ TWO KEYS FOR ONE PRODUCT WAS THE THING TO REMOVE, not to
   * re-tier: one of them had to go, and the one that goes is the one whose name says "preview".
   *
   * ⚠️ **THE DATABASE ROW IS LEFT ALONE AND IS NOW INERT.** `canAccess` only ever looks up a key it is
   * given, so `{"places_posts_preview": true}` in `feature_overrides` matches no `Feature` and changes
   * nothing — which is exactly why it is safe to leave it there rather than run an UPDATE.
   * 🔴 AND THAT IS ALSO WHY THE KEY WAS **REMOVED RATHER THAN PROMOTED INTO A PLAN SET.** Had it stayed
   * and joined `PRO_FEATURES`, Pizza Kitchen would still have been granted by its OVERRIDE — overrides
   * win before any plan is consulted — so the one truck used to check the launch would have been the
   * one truck not testing the new gate.
   */

/** Whether the truck's EFFECTIVE plan has a feature switched on (lib/plans.ts planFeatureSwitch / truckPlanSwitch). */
export type PlanFeatureSwitch = (feature: Feature) => boolean

/** Why a feature is off for a truck: its own override, or its plan. `null` = it is on. */
export type FeatureBlock = 'override' | 'plan' | null

/**
 * 🔴 WHY A FEATURE IS OFF, IN THE ONE RESOLUTION ORDER:
 * • an override for the feature decides: `true` → on; any other value → off, because of the OVERRIDE;
 * • no override → the effective plan's switch: off → off, because of the PLAN;
 * • else on.
 * The caller words the two differently: an override reads "switched off for your truck"; a plan reads the one upgrade
 * prompt, naming the first public plan that has the feature (lib/plans.ts upgradePlanFor).
 */
export function featureBlock(feature: Feature, featureOverrides: Record<string, boolean> | null | undefined, planAllows: PlanFeatureSwitch): FeatureBlock {
  const o = featureOverrides && typeof featureOverrides === 'object' ? featureOverrides : {}
  if (Object.prototype.hasOwnProperty.call(o, feature)) return o[feature] === true ? null : 'override'
  return planAllows(feature) ? null : 'plan'
}

/**
 * 🔴 THE ONE ACCESS CHECK: override → the effective plan's switch → allowed (see `featureBlock`).
 * ⚠️ THE PLAN SWITCH IS REQUIRED, deliberately: a caller cannot forget the plan. Build it with lib/plans.ts
 * `truckPlanSwitch(truck, catalog)`, or on a surface without the catalogue from the server-sent `plan_blocks`
 * (lib/useFeatures.ts).
 */
export function canAccess(feature: Feature, featureOverrides: Record<string, boolean> | null | undefined, planAllows: PlanFeatureSwitch): boolean {
  return featureBlock(feature, featureOverrides, planAllows) === null
}

/** Is `key` one of the code's features? (Validates public.plan_features rows and override keys.) */
export function isFeature(key: unknown): key is Feature {
  return typeof key === 'string' && (FEATURES as readonly string[]).includes(key)
}

// ── BATCH RESERVATIONS — THE PER-TRUCK SWITCH (P3, 18 September 2026; plan-free since 19 October 2026) ──────────────
// ON iff trucks.feature_overrides->>'batch_reservations' = 'true'. OFF otherwise. It is NOT a Feature and never passes
// through canAccess. ⚠️ IT USED TO BE ON FOR `plan = 'demo'` TOO — a plan name in code. Since Stage A the demo trucks
// carry the override instead (20261024_plans.sql writes it to every existing demo truck; lib/provision-truck.ts writes it
// for a new one), so the behaviour is unchanged and no code names the demo plan.
export function resolveBatchReservations(truck: { feature_overrides?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!truck) return false
  const v = truck.feature_overrides && typeof truck.feature_overrides === 'object' ? (truck.feature_overrides as Record<string, unknown>)['batch_reservations'] : undefined
  return v === true || v === 'true'
}
