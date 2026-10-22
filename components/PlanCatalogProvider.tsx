'use client'
// components/PlanCatalogProvider.tsx — the plan catalogue (public.plans / public.plan_prices) for the browser
// (plans-data-model, Stage A, 19 October 2026). The tables are service-role only, so the server sends the catalogue in
// the page's authenticated payload (the Manage GET) and this hands it down — the CountrySettingsProvider pattern.
// Read it with lib/plans.ts; nothing here names a plan.
import { createContext, useContext, useMemo } from 'react'
import type { PlanCatalog } from '@/lib/plans'
import { localizePlans } from '@/lib/plan-names'
import { useAppLocale } from '@/lib/i18n/use-t'

const PlanCatalogContext = createContext<PlanCatalog | null>(null)

export function PlanCatalogProvider({ catalog, children }: { catalog: PlanCatalog; children: React.ReactNode }) {
  // languages-1: the plans' names, descriptions and subtitles in the truck's language (lib/plan-names.ts) — the SAME catalogue
  // object for every English locale.
  const locale = useAppLocale()
  const value = useMemo(() => localizePlans(catalog, locale), [catalog, locale])
  return <PlanCatalogContext.Provider value={value}>{children}</PlanCatalogContext.Provider>
}

/** The catalogue. 🔴 THROWS outside a provider — a screen that silently had no plans would show the wrong one. */
export function usePlanCatalog(): PlanCatalog {
  const c = useContext(PlanCatalogContext)
  if (!c) throw new Error('[plans] usePlanCatalog() needs a <PlanCatalogProvider> above it')
  return c
}

/** The catalogue, or null outside a provider (for shared components that may render without one). */
export function useOptionalPlanCatalog(): PlanCatalog | null {
  return useContext(PlanCatalogContext)
}
