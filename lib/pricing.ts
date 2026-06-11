// lib/pricing.ts
// Pre-launch pricing gate — SINGLE source for masking commercially-sensitive prices.
// Until NEXT_PUBLIC_PRICING_PUBLISHED === 'true', concrete monetary prices render as "TBC" so
// test trucks don't see/share real pricing before launch. Free / 0% / Pay at Hatch / Lifetime /
// Free trial are not commercially sensitive and always show as-is. Flips on at launch via env,
// no code change. Used by the Billing page, FeatureGate upgrade CTAs, and the per-van add-on.
export const PRICING_PUBLISHED = process.env.NEXT_PUBLIC_PRICING_PUBLISHED === 'true'

const NON_SECRET_PRICE = new Set(['Free', 'Free trial', 'Lifetime', '0%', 'Pay at Hatch'])

/** Real price string when published; otherwise "TBC" (unless it's a non-sensitive value). */
export function maskPrice(val: string): string {
  return (PRICING_PUBLISHED || NON_SECRET_PRICE.has(val)) ? val : 'TBC'
}
