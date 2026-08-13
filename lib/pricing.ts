// lib/pricing.ts
// Pre-launch pricing gate — SINGLE source for masking commercially-sensitive prices.
// Until NEXT_PUBLIC_PRICING_PUBLISHED === 'true', concrete monetary prices render as "TBC" so
// test trucks don't see/share real pricing before launch. Free / 0% / Pay at Hatch / Lifetime /
// Free trial are not commercially sensitive and always show as-is. Flips on at launch via env,
// no code change. Used by the Billing page, FeatureGate upgrade CTAs, and the per-van add-on.
export const PRICING_PUBLISHED = process.env.NEXT_PUBLIC_PRICING_PUBLISHED === 'true'

// ⚠️ `Unlimited` and `—` ADDED WITH THE THREE-ROW FEE TABLE (lib/plan-features.ts). Neither is a price:
// one says a trial's online orders are uncapped, the other says a plan has no online-order allowance at
// all. They belong to the class this set already exists for — the comment above states the test, "they
// carry no commercial information and blanking them to 'TBC' would read as broken", and an em dash
// rendered as "TBC" is precisely that. The two allowance amounts and the 0.99% rate are deliberately NOT
// here and are still masked until pricing is published.
const NON_SECRET_PRICE = new Set(['Free', 'Free trial', 'Lifetime', '0%', 'Pay at Hatch', 'Unlimited', '—'])

/** Real price string when published; otherwise "TBC" (unless it's a non-sensitive value).
 *  ⚠️ GLOBAL ONLY — it has no truck context and cannot honour `trucks.hide_pricing`. Kept as the
 *  primitive `maskPriceFor` is built on. **Do not call it from a component**: use `usePriceMask()` from
 *  components/PricingPolicy.tsx, which knows which truck is on screen. */
export function maskPrice(val: string): string {
  return (PRICING_PUBLISHED || NON_SECRET_PRICE.has(val)) ? val : 'TBC'
}

/** ── THE RULE (V11.2, per-truck suppression) ────────────────────────────────────────────────────────
 *  A price is visible when the GLOBAL flag is on AND this truck is not individually suppressed.
 *  🔴 `hidePricing` is ANDed, never overridden — that is the entire point. The global flag is about
 *  whether pricing is public yet; the per-truck flag is about whether THIS operator has been shown their
 *  numbers. Flipping NEXT_PUBLIC_PRICING_PUBLISHED to 'true' must not reveal prices to a truck that is
 *  still suppressed, so `hidePricing` cannot sit on the permissive side of an OR.
 *  Non-sensitive values (Free / Free trial / Lifetime / 0% / Pay at Hatch) are exempt from both, exactly
 *  as before — they carry no commercial information and blanking them to "TBC" would read as broken. */
export function pricesVisibleFor(hidePricing: boolean): boolean {
  return PRICING_PUBLISHED && !hidePricing
}

/** Per-truck maskPrice. `hidePricing` false ⇒ identical to `maskPrice`. */
export function maskPriceFor(val: string, hidePricing: boolean): string {
  if (NON_SECRET_PRICE.has(val)) return val
  return pricesVisibleFor(hidePricing) ? val : 'TBC'
}
