'use client'
// components/PlanCatalogProvider.tsx — the plan catalogue (public.plans / public.plan_prices) for the browser
// (plans-data-model, Stage A, 19 October 2026). The tables are service-role only, so the server sends the catalogue in
// the page's authenticated payload (the Manage GET) and this hands it down — the CountrySettingsProvider pattern.
// Read it with lib/plans.ts; nothing here names a plan.
import { createContext, useContext } from 'react'
import type { PlanCatalog } from '@/lib/plans'

const PlanCatalogContext = createContext<PlanCatalog | null>(null)

export function PlanCatalogProvider({ catalog, children }: { catalog: PlanCatalog; children: React.ReactNode }) {
  return <PlanCatalogContext.Provider value={catalog}>{children}</PlanCatalogContext.Provider>
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
