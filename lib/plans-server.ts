// lib/plans-server.ts — the plan catalogue, loaded on the server (plans-data-model, Stage A; docs/plans-data-model-report.md;
// feature switches, Stage A2, docs/plan-features-config-report.md).
// public.plans, public.plan_prices and public.plan_features are SERVICE ROLE ONLY (RLS on, no policies — the country_settings rule), so the
// browser never reads them: the server loads the catalogue here and hands it on in the same payload as the country
// settings. Cached for 60 seconds, like lib/country-settings.ts.
// 🔴 IT FAILS LOUDLY. A read error, or a catalogue without exactly one signup-default / expiry-fallback / demo plan,
// THROWS — it never invents a plan. ⚠️ A feature switch naming no code feature is the one exception (Stage B, decision 1):
// it is IGNORED and logged, and Admin shows it — one typo must not take every page down.
import { mapPlanRow, mapPriceRow, mapFeatureRow, catalogProblems, splitUnknownFeatures, effectivePlan, planPriceFor, PLAN_COLUMNS, PLAN_PRICE_COLUMNS, PLAN_FEATURE_COLUMNS, type PlanCatalog } from '@/lib/plans'

const TTL_MS = 60_000
let cache: { at: number; value: PlanCatalog } | null = null

/** The whole catalogue (plans in sort order, every price row, every feature switch). Throws on a failed read or an
 *  unsound catalogue. */
export async function getPlanCatalog(): Promise<PlanCatalog> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  // ⚠️ IMPORTED HERE, NOT AT THE TOP, for the reason lib/country-settings.ts gives: lib/supabase.ts builds the
  // service-role client at module load, and modules that only NAME this loader must be loadable without a database.
  const { supabase } = await import('@/lib/supabase')
  const value = await readPlanCatalog(supabase)
  cache = { at: Date.now(), value }
  return value
}

/** A minimal query surface (the service-role client, or a harness's fake). */
type CatalogClient = { from: (table: string) => { select: (cols: string) => unknown } }

/**
 * The catalogue read through a GIVEN client, uncached — for code that already holds one (lib/payments/promote-draft.ts
 * runs on the client its caller passes). Validated exactly like `getPlanCatalog`.
 */
export async function readPlanCatalog(client: CatalogClient): Promise<PlanCatalog> {
  type Res = { data: unknown[] | null; error: { message: string } | null }
  const plansQ = client.from('plans').select(PLAN_COLUMNS) as unknown as { order: (c: string, o: { ascending: boolean }) => Promise<Res> }
  const [plans, prices, features] = await Promise.all([
    plansQ.order('sort_order', { ascending: true }),
    client.from('plan_prices').select(PLAN_PRICE_COLUMNS) as unknown as Promise<Res>,
    client.from('plan_features').select(PLAN_FEATURE_COLUMNS) as unknown as Promise<Res>,
  ])
  if (plans.error) throw new Error(`[plans] could not read public.plans: ${plans.error.message}`)
  if (prices.error) throw new Error(`[plans] could not read public.plan_prices: ${prices.error.message}`)
  if (features.error) throw new Error(`[plans] could not read public.plan_features: ${features.error.message}`)
  const value: PlanCatalog = splitUnknownFeatures({
    plans: ((plans.data ?? []) as Record<string, unknown>[]).map(mapPlanRow),
    prices: ((prices.data ?? []) as Record<string, unknown>[]).map(mapPriceRow),
    features: ((features.data ?? []) as Record<string, unknown>[]).map(mapFeatureRow),
  })
  // Stage B (decision 1): a switch naming no code feature is ignored and logged — never a refused catalogue.
  for (const f of value.ignoredFeatures ?? []) {
    console.warn(`[plans] plan_features row ignored — "${f.feature}" (plan "${f.planKey}") is not a feature in lib/features.ts FEATURES`)
  }
  const problems = catalogProblems(value)
  if (problems.length) throw new Error(`[plans] the plan catalogue is not sound: ${problems.join('; ')}`)
  return value
}

/** Forget the cached catalogue (after an admin change, and in harnesses). */
export function clearPlanCatalogCache(): void {
  cache = null
}

/**
 * The platform fee (basis points) of the truck's EFFECTIVE plan in a country — plan_prices.fee_bps — or null when the
 * plan has no price row there. Read by lib/order-charge-rules.ts only while the country's platform fee is switched on.
 * 🔴 THROWS on a failed read: a fee is never guessed.
 */
export async function truckPlanFeeBps(truckId: string, countryCode: string): Promise<number | null> {
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.from('trucks').select('plan, trial_expires_at').eq('id', truckId).single()
  if (error || !data) throw new Error(`[plans] could not read the plan of truck ${truckId}: ${error?.message ?? 'not found'}`)
  const catalog = await getPlanCatalog()
  const eff = effectivePlan(data as { plan: string; trial_expires_at: string | null }, catalog)
  return planPriceFor(catalog, eff.plan.key, countryCode)?.feeBps ?? null
}

/**
 * seo-fixes S5 (20 October 2026): when the plan data a country's pricing pages show LAST CHANGED — the newest
 * `updated_at` of public.plans, of that country's public.plan_prices rows and of public.plan_features — or null when
 * none can be read. The sitemap's lastmod for the country pages (app/sitemap.ts); never throws.
 */
export async function planDataUpdatedAt(countryCode: string, client?: CatalogClient): Promise<Date | null> {
  try {
    const c = client ?? (await import('@/lib/supabase')).supabase
    type Res = { data: { updated_at?: string | null }[] | null; error: unknown }
    const pricesQ = c.from('plan_prices').select('updated_at') as unknown as { eq: (k: string, v: string) => Promise<Res> }
    const [plans, prices, features] = await Promise.all([
      c.from('plans').select('updated_at') as unknown as Promise<Res>,
      pricesQ.eq('country_code', countryCode),
      c.from('plan_features').select('updated_at') as unknown as Promise<Res>,
    ])
    let latest: number | null = null
    for (const r of [plans, prices, features]) {
      if (r.error) return null
      for (const row of r.data ?? []) {
        const t = row.updated_at ? Date.parse(row.updated_at) : NaN
        if (Number.isFinite(t) && (latest === null || t > latest)) latest = t
      }
    }
    return latest === null ? null : new Date(latest)
  } catch {
    return null
  }
}
