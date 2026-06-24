/** Returns true if a modifier option is available to order.
 *  Treats undefined/null (unset) as available — defensive against old rows.
 *  Sold-out = manual (available===false) OR out of stock (stock_count===0). D2 derives the
 *  out-of-stock state HERE (approach b) rather than syncing an `available` flag from the count —
 *  so a re-increment above 0 naturally makes the option selectable again. stock_count null/undefined
 *  = untracked → always available. */
export const isModifierAvailable = (opt: { available?: boolean; stock_count?: number | null }) =>
  opt.available !== false && opt.stock_count !== 0
