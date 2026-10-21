// lib/price-words.ts — 🔴 THE WORDS A PRICE CELL CAN HOLD INSTEAD OF AN AMOUNT, EACH WITH A CODE ID
// (Language Phase 0, docs/language-phase-0-report.md §2).
//
// PURE. 'Free', 'Pay at Hatch', 'Unlimited' and the rest describe a model, not an amount, so the pre-launch
// price mask lets them through (lib/pricing.ts). They used to be typed as literals in five files and matched by
// exact string in a sixth — a reworded or translated word would have been masked as "TBC" with nothing failing.
// Now every producer writes `PRICE_WORD.<id>` and the mask asks `isPriceWord`, so the words and the mask's list
// are one definition. "Pay at Hatch" is a brand name in every country (Dominic, 13 October 2026).
// anz-1 (21 October 2026, approved in the anz-1 brief): its DISPLAY word is "Pay at the truck" in en-US, en-IE, en-AU and
// en-NZ (planFeatures.priceWord.payAtHatch); en-GB keeps "Pay at Hatch". The id and this English value are unchanged — it is
// only ever shown through priceText() in a banner sentence, never as a masked price cell.
// ⚠️ The em dash '—' is a protected string (lib/landing-table.ts header): never normalised to a hyphen.

export const PRICE_WORD = {
  free: 'Free',
  freeTrial: 'Free trial',
  lifetime: 'Lifetime',
  zeroPercent: '0%',
  payAtHatch: 'Pay at Hatch',
  unlimited: 'Unlimited',
  none: '—',
} as const

export type PriceWordId = keyof typeof PRICE_WORD

const WORDS = new Set<string>(Object.values(PRICE_WORD))
/** Is this cell one of the price words (a model, not an amount)? */
export const isPriceWord = (val: string): boolean => WORDS.has(val)
