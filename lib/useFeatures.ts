import { featureBlock, type Feature, type FeatureBlock, type PlanFeatureSwitch } from './features'
import { truckPlanSwitch, upgradePlanFor, promptPlan, type PlanCatalog, type PlanBlocks, type PlanPromptPlan, type TruckPlanFields } from './plans'
import { useOptionalPlanCatalog } from '@/components/PlanCatalogProvider'
import { useOptionalCountrySettings } from '@/components/CountrySettingsProvider'

/**
 * Which features a truck may use, as a hook (plan-features-config, Stage A2, 20 October 2026).
 * 🔴 THE ONE RESOLUTION ORDER, lib/features.ts featureBlock: the per-truck override → the truck's EFFECTIVE plan's switch
 * → allowed. The plan's switches come from either source, whichever the surface has:
 *   • the plan catalogue (Manage — <PlanCatalogProvider>), resolved here with lib/plans.ts; or
 *   • `truck.plan_blocks`, which the server computes for surfaces without the catalogue (the kitchen dashboard and KDS,
 *     /api/dashboard — lib/plans.ts planBlocks).
 * ⚠️ With neither, only the override decides — every server route enforces the plan regardless.
 */
export interface TruckFeatureContext extends TruckPlanFields {
  feature_overrides?: Record<string, boolean> | null
  /** The features the truck's effective plan switches off, from the server (surfaces without the catalogue). */
  plan_blocks?: PlanBlocks | null
  country?: string | null
}

export interface FeatureAccessView {
  /** May the truck use it? */
  can: (feature: Feature) => boolean
  /** Why not: its override, or its plan (null = allowed). */
  block: (feature: Feature) => FeatureBlock
  /** The plan the one upgrade prompt names when the PLAN is why (null otherwise, or when no public plan has it). */
  upgradeTo: (feature: Feature) => PlanPromptPlan | null
}

/** The resolver without React — the same answers the hook gives (harnesses and server renders use it). */
export function featureAccessView(truck: TruckFeatureContext | null | undefined, catalog: PlanCatalog | null, countryCode: string | null | undefined): FeatureAccessView {
  const overrides = truck?.feature_overrides ?? null
  const blocks = truck?.plan_blocks ?? null
  const allows: PlanFeatureSwitch = catalog
    ? truckPlanSwitch(truck, catalog)
    : (f: Feature) => !(blocks && Object.prototype.hasOwnProperty.call(blocks, f))
  const block = (f: Feature) => featureBlock(f, overrides, allows)
  return {
    can: f => block(f) === null,
    block,
    upgradeTo: f => {
      if (block(f) !== 'plan') return null
      if (catalog) { const up = upgradePlanFor(catalog, f); return up ? promptPlan(catalog, up, countryCode) : null }
      return blocks?.[f]?.upgradeTo ?? null
    },
  }
}

export function useFeatures(truck: TruckFeatureContext | null | undefined): FeatureAccessView {
  const catalog = useOptionalPlanCatalog()
  const country = useOptionalCountrySettings()
  return featureAccessView(truck, catalog, country?.countryCode ?? truck?.country ?? null)
}
