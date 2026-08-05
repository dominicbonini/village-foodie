'use client'
// components/PricingPolicy.tsx
// WHICH TRUCK'S PRICING POLICY IS ON SCREEN — supplied once, consumed anywhere.
//
// ── WHY A CONTEXT AND NOT A PARAMETER ───────────────────────────────────────────────────────────────
// `maskPrice()` took a string and nothing else, and it has ~17 call sites across two files. Threading a
// `hidePricing` boolean through every one of them would have worked TODAY and failed on the NEXT price
// added: a new call site that forgets the argument compiles fine (or is handed a default) and silently
// renders a real price to a suppressed operator. That is the projection-omission class the manual records
// three times — a rule that depends on every future author remembering it is not a rule, it is a warning.
//
// A context inverts it. `usePriceMask()` returns a masking function that ALREADY KNOWS which truck it is
// for, so a new call site is correct because it cannot easily be otherwise; the truck is not something the
// author has to know about or pass.
//
// 🔴 THE DEFAULT IS `true` — HIDE. Read that twice: it is deliberately NOT the same default as the column.
//   • The COLUMN defaults to false, because "we have never thought about this truck" means "prices follow
//     the global flag", which is every truck's behaviour today.
//   • The CONTEXT defaults to true, because "this component is rendering outside a provider" means we do
//     not know whose truck this is — and the two failure directions are not symmetric. Over-masking shows
//     "TBC" to someone who could have seen a price: visible, harmless, and reported within a day.
//     Under-masking shows a real price to an operator we promised not to: invisible to us, and the exact
//     thing this feature exists to prevent. Fail toward the mistake that announces itself (§35).
import { createContext, useContext, useMemo } from 'react'
import { maskPriceFor, pricesVisibleFor } from '@/lib/pricing'

const HidePricingContext = createContext<boolean>(true)   // see the note above — `true` means HIDE

/** Wrap the operator surface once, as high as the truck is available.
 *  ⚠️ `hidePricing` is `truck.hide_pricing ?? false` at the call site, NOT `?? true`: an ABSENT column
 *  (pre-migration, or a projection that drops it) must behave as today's product — prices follow the
 *  global flag. That is a different question from "no provider at all" and takes the opposite default. */
export function PricingPolicyProvider({ hidePricing, children }: {
  hidePricing: boolean
  children: React.ReactNode
}) {
  return <HidePricingContext.Provider value={hidePricing}>{children}</HidePricingContext.Provider>
}

/** The masking function for the truck on screen. Drop-in for the old `maskPrice`:
 *  `const px = usePriceMask()` then `px('£29/mo')`. */
export function usePriceMask(): (val: string) => string {
  const hidePricing = useContext(HidePricingContext)
  // Memoised so it is stable across renders — it is passed straight into JSX and would otherwise be a
  // fresh identity every render for any consumer that memoises on it.
  return useMemo(() => (val: string) => maskPriceFor(val, hidePricing), [hidePricing])
}

/** The raw question, for copy that is gated on pricing being public without rendering a price itself —
 *  e.g. the fee footnote, which substitutes a whole different sentence rather than masking a value. */
export function usePricesVisible(): boolean {
  return pricesVisibleFor(useContext(HidePricingContext))
}
