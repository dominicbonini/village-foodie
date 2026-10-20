// lib/plan-refusal.ts — 🔴 THE SERVER'S ONE ANSWER WHEN A FEATURE IS OFF (plan-features-config, Stage A2;
// docs/plan-features-config-report.md). SERVER ONLY (it reads the catalogue through lib/plans-server.ts).
//
// Two refusals, worded differently, decided by the one resolution order (lib/features.ts featureBlock):
//   • the truck's OVERRIDE switched it off  → `feature_switched_off` (the existing "switched off for your truck");
//   • its EFFECTIVE PLAN switched it off    → `feature_not_on_plan`, carrying the plan the one upgrade prompt names
//     (the first active public plan, in sort_order, that has it on) and the feature's name, in the truck's language.
//     If no public plan has it, the refusal falls back to `feature_switched_off` — there is nothing to upgrade to.
import { getPlanCatalog } from '@/lib/plans-server'
import { featureAccess, type TruckAccessFields, type PlanCatalog } from '@/lib/plans'
import type { Feature } from '@/lib/features'
import type { ManageErrorCode, ManageErrorParams } from '@/lib/i18n/manage-errors'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/planPrompt'

export interface FeatureRefusal { code: Extract<ManageErrorCode, 'feature_switched_off' | 'feature_not_on_plan'>; params: ManageErrorParams }

/** The feature's name and grammatical number in a locale — the `{feature}` / `{many}` params of the prompt and refusal. */
export function featureWords(locale: string | null | undefined, feature: Feature): { feature: string; many: string } {
  const t = translatorFor(locale, 'planPrompt')
  return { feature: t(`features.${feature}.name` as never), many: t(`features.${feature}.many` as never) }
}

/** The refusal for a feature on this truck, or null when it is allowed. `catalog` may be passed when already loaded. */
export async function featureRefusal(truck: TruckAccessFields, feature: Feature, locale: string | null | undefined, catalog?: PlanCatalog): Promise<FeatureRefusal | null> {
  const cat = catalog ?? await getPlanCatalog()
  const a = featureAccess(truck, cat, feature)
  if (a.allowed) return null
  if (a.block === 'plan' && a.upgradeTo) return { code: 'feature_not_on_plan', params: { ...featureWords(locale, feature), plan: a.upgradeTo.name } }
  return { code: 'feature_switched_off', params: {} }
}
