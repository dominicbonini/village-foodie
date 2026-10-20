'use client'
// components/usePlanPriceLabel.ts — 🔴 HOW A PLAN'S MONTHLY PRICE IS WRITTEN OUTSIDE THE FROZEN TABLES (plan-features-
// config, Stage A2). The Billing plan card, its "Change your plan" buttons and switch modal, and the one upgrade prompt
// read their amounts from public.plan_prices (lib/plans.ts) and write them through THIS — never the retired
// country_settings columns.
// 🔴 THE MASK IS THE VAN MODAL'S RULE: every amount is hidden ("TBC" / US "TBD") while the truck's COUNTRY IS SWITCHED
// OFF, and otherwise through the existing policy mask (NEXT_PUBLIC_PRICING_PUBLISHED and trucks.hide_pricing). A price
// WORD ("Free") is never masked.
import { usePriceMask } from '@/components/PricingPolicy'
import { useOptionalCountrySettings } from '@/components/CountrySettingsProvider'
import { moneyFormatOf } from '@/lib/country-settings-types'
import { perMonthLabel } from '@/lib/money-format'
import { maskPriceFor } from '@/lib/pricing'
import { PRICE_WORD } from '@/lib/price-words'
import { priceText } from '@/lib/price-text'

/** The mask alone: `(written amount or price word) → shown`, in the truck's words. Used for any plan_prices amount. */
export function usePlanPriceMask(): (raw: string) => string {
  const policyMask = usePriceMask()
  const cs = useOptionalCountrySettings()
  return raw => priceText(cs?.enabled ? policyMask(raw) : maskPriceFor(raw, true), cs?.locale ?? null)
}

/** `(minor, unit) → "£29/mo" | "Free" | "TBC"`, or null when there is no amount (no price row) or no country row. */
export function usePlanPriceLabel(): (minor: number | null | undefined, unit?: 'mo' | 'month') => string | null {
  const mask = usePlanPriceMask()
  const cs = useOptionalCountrySettings()
  return (minor, unit = 'mo') => {
    if (minor === null || minor === undefined || !cs) return null
    return mask(minor === 0 ? PRICE_WORD.free : perMonthLabel(minor, moneyFormatOf(cs), unit))
  }
}
