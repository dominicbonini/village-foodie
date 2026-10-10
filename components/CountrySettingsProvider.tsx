'use client'
// components/CountrySettingsProvider.tsx — THE TRUCK'S COUNTRY SETTINGS, supplied once, read anywhere below.
//
// The operator surfaces (Manage → Billing, Payments, the van add-on, FeatureGate's upgrade line) quote the
// truck's own plan prices and card fees. Those come from public.country_settings, which a browser may never
// read (service role only — V12.1). So /api/manage reads the truck's row server-side and returns it in the
// response the page already authenticates for, and the page puts it here.
//
// ── WHY A CONTEXT ─────────────────────────────────────────────────────────────────────────────────────
// The same reason as PricingPolicy.tsx beside it: a price added later must be in the right currency
// without its author having to know which truck is on screen or remember to thread a prop through.
//
// 🔴 NO DEFAULT. useCountrySettings() THROWS outside a provider. PricingPolicy can default to "hide",
// because "TBC" is a safe answer; there is no safe currency to default to. Rendering GB's prices to a truck
// whose settings never arrived is exactly the silent fallback lib/country-settings.ts refuses — so a
// missing provider is a crash the developer sees, not a wrong price an operator sees.
import { createContext, useContext } from 'react'
import type { CountrySettings } from '@/lib/country-settings-types'

const CountrySettingsContext = createContext<CountrySettings | null>(null)

export function CountrySettingsProvider({ settings, children }: {
  settings: CountrySettings
  children: React.ReactNode
}) {
  return <CountrySettingsContext.Provider value={settings}>{children}</CountrySettingsContext.Provider>
}

/** The settings for the truck on screen. 🔴 Throws if there is no provider — see the header. */
export function useCountrySettings(): CountrySettings {
  const s = useContext(CountrySettingsContext)
  if (!s) throw new Error('[country-settings] no CountrySettingsProvider above this component — refusing to guess a currency')
  return s
}
