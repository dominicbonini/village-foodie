// lib/comparison-selection.ts — 🔴 WHICH COMPETITORS A COUNTRY'S COMPARISON PAGE SHOWS: AT MOST FOUR (compare-suits-1, 6 November 2026;
// docs/compare-suits-1-report.md). PURE, client-safe: lib/comparison.ts (the page and its twins), Admin › Pricing check and
// scripts/compare-suits-1.cjs run the same function.
//
// THE RULE, in order:
//   1. hidden (comparison_entries.hidden, Admin's) never shows;
//   2. pinned (Admin's) first;
//   3. then entries whose pricing is verified (the plan the entry shows is verified);
//   4. within each, by category: food_truck, general_pos, marketplace, restaurant, then not known;
//   5. ties: the most verified feature answers in that country; then the entry's own order; then the name;
//   6. at most four. The rest are still checked by the checker — they are only not shown.
// The PUBLIC view applies this to the entries that are public already (entry, plan and features verified — lib/comparison.ts
// entryIsPublic): a pinned entry that is not verified is still not public. An admin's full view applies it to every entry, so the
// four it shows are the four the page will show once they are verified.
export const MAX_SHOWN = 4
export const CATEGORIES = ['food_truck', 'general_pos', 'restaurant', 'marketplace'] as const
export type Category = (typeof CATEGORIES)[number]
export const isCategory = (v: unknown): v is Category => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
/** The order categories are shown in (the brief's): food_truck, then general_pos, then marketplace, then restaurant; unknown last. */
export const CATEGORY_RANK: Readonly<Record<Category, number>> = { food_truck: 0, general_pos: 1, marketplace: 2, restaurant: 3 }
const rank = (c: Category | null | undefined) => (c ? CATEGORY_RANK[c] : 4)

export interface SelectionCandidate<E> {
  entry: E
  name: string
  pinned: boolean
  hidden: boolean
  sortOrder: number
  category: Category | null
  /** The plan the entry shows is verified. */
  pricingVerified: boolean
  /** How many of its current answers in this country are verified. */
  verifiedFeatures: number
}
export type NotShownReason = 'hidden' | 'beyond_four'
export interface Selection<E> { shown: SelectionCandidate<E>[]; notShown: { candidate: SelectionCandidate<E>; reason: NotShownReason }[] }

/** The candidates in the rule's order (hidden ones left out). */
export function selectionOrder<E>(cands: readonly SelectionCandidate<E>[]): SelectionCandidate<E>[] {
  return cands.filter(c => !c.hidden).sort((a, b) =>
    Number(b.pinned) - Number(a.pinned)
    || Number(b.pricingVerified) - Number(a.pricingVerified)
    || rank(a.category) - rank(b.category)
    || b.verifiedFeatures - a.verifiedFeatures
    || a.sortOrder - b.sortOrder
    || a.name.localeCompare(b.name))
}

/** The shown set (at most `cap`, in order) and every other candidate with the reason it is not shown. */
export function selectShown<E>(cands: readonly SelectionCandidate<E>[], cap = MAX_SHOWN): Selection<E> {
  const ordered = selectionOrder(cands)
  return {
    shown: ordered.slice(0, cap),
    notShown: [...cands.filter(c => c.hidden).map(c => ({ candidate: c, reason: 'hidden' as const })),
      ...ordered.slice(cap).map(c => ({ candidate: c, reason: 'beyond_four' as const }))],
  }
}
