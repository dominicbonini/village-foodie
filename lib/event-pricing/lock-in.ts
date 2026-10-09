/**
 * ══ 🔴 "SET EACH PRICE MYSELF" FREEZES THE PRICES THAT WERE ALREADY BEING CHARGED ═════════════════
 *
 * **DOMINIC'S RULE:** *"when an event type is switched to 'Set each price myself', every item keeps
 * exactly the price it had just before the switch, under the old rule including its rounding. A price
 * only changes when the operator edits that item."*
 *
 * ⛔ **THE FAULT THIS CLOSES.** `applyPriceRule` applies a stored rounding WHATEVER the mode — the rule
 * branches are skipped for `'none'` but the rounding step after them is not. So a type on
 * "+10%, nearest £1" that was switched to "Set each price myself" kept `price_rounding: 'nearest_1'`
 * in the database, both screens hid the control (it is not one of `PRICE_MODES_WITH_AMOUNT`), and every
 * untyped item went on being rounded to the pound with nothing on any screen saying so. Clearing the
 * rounding on its own would have been worse: every price would have MOVED, silently, on a settings
 * save. See docs/phone-fixes-2-report.md §2.4.
 *
 * 🔴 **SO THE PRICES ARE WRITTEN DOWN BEFORE THE RULE IS TAKEN AWAY.** Each untyped item gets a typed
 * price equal to what it was being charged a moment earlier, and only then are the amount and the
 * rounding cleared. The arithmetic is untouched, so nothing that is not saved can change.
 *
 * ⚠️ THE PURE HALF IS HERE AND THE DATABASE HALF IS IN THE ROUTE, so `scripts/event-pricing.cjs` can
 * put real numbers through the real decision with no client at all.
 */

import { applyPriceRule, isPriceMode, isPriceRounding, toPounds } from './price'
import type { PriceSetup, PriceMode, PriceRounding } from './price'
import type { PricingItem } from './read'

/** A type's four price columns as they stand, and the patch about to be written over them. */
export interface LockInQuestion {
  /** `price_change_on` BEFORE this save. */
  wasOn: boolean
  /** `price_change_on` AFTER it — the patch's value where it carries one, else `wasOn`. */
  willBeOn: boolean
  oldMode: string | null | undefined
  oldRounding: string | null | undefined
  /** `price_mode` AFTER this save — the patch's value where it carries one, else `oldMode`. */
  newMode: string | null | undefined
}

/**
 * Does this save need the prices written down first?
 *
 * **Yes when all three hold:**
 *   1. the type is charging its own prices before AND after (`wasOn && willBeOn`) — if it was off, the
 *      prices being charged were the menu's and there is nothing to preserve; if it is being turned
 *      off, the rule stops applying anyway;
 *   2. it ends this save in `'none'` — either because the patch sets it there, or because it is
 *      already there and the patch does not move it. ⛔ **SWITCHING OUT OF `'none'` MUST NOT LOCK IN:**
 *      the operator is choosing a new rule, and a typed price for every item would make that rule do
 *      nothing at all, because a typed price is never ruled;
 *   3. 🔴 **THE OLD SETUP COULD ACTUALLY MOVE A PRICE** — it had a rule mode, or a rounding. This is
 *      the clause that makes the whole thing settle: after one lock-in the type is `'none'` with
 *      rounding `'none'`, which moves nothing, so no later save locks in again. **That is what lets an
 *      item added afterwards keep following its menu price** instead of being frozen by the next save
 *      of an unrelated setting.
 *
 * ⚠️ CASE (2) IS ALSO §2 OF THE BRIEF — a type ALREADY sitting in `'none'` with a stale rounding is
 * locked in the next time it is saved, with no migration and no backfill. Until then its arithmetic is
 * untouched and it charges exactly what it charges today.
 */
export function shouldLockIn(q: LockInQuestion): boolean {
  if (!q.wasOn || !q.willBeOn) return false
  const ends = isPriceMode(q.newMode) ? q.newMode : 'none'
  if (ends !== 'none') return false
  const oldMode: PriceMode = isPriceMode(q.oldMode) ? q.oldMode : 'none'
  const oldRounding: PriceRounding = isPriceRounding(q.oldRounding) ? q.oldRounding : 'none'
  return oldMode !== 'none' || oldRounding !== 'none'
}

/** One item's price, frozen. `price` is in POUNDS, which is what `event_item_prices.price` holds. */
export interface LockedInPrice {
  itemId: string
  price: number
}

/**
 * The prices to write down: **every item that does not already have one of its own.**
 *
 * ⛔ AN ITEM THAT ALREADY HAS A TYPED PRICE IS LEFT ALONE. It is the operator's own number, it was
 * already what the item charged (a typed price is never ruled and never rounded), and overwriting it
 * with a recomputed one would be this function changing a price while claiming to preserve them.
 *
 * ⚠️ THE PRICE IS `applyPriceRule` UNDER THE **OLD** SETUP, which is the same function the customer's
 * menu, the order submit and the dashboard column all price with — so "what it was charging" is not
 * re-derived here, it is asked of the one place that knows.
 *
 * @param items  every item of the truck, from `loadPricingItems` — the same set the price column uses,
 *               with no availability filter, because a sold-out dish must stay priceable.
 * @param typed  the type's existing typed prices, in pounds, keyed by `menu_items_db.id`.
 */
export function lockedInPrices(
  items: readonly PricingItem[],
  oldSetup: PriceSetup,
  typed: Readonly<Record<string, number>>,
): LockedInPrice[] {
  const out: LockedInPrice[] = []
  for (const it of items) {
    if (typed[it.id] !== null && typed[it.id] !== undefined) continue
    out.push({ itemId: it.id, price: toPounds(applyPriceRule(it.pricePence, oldSetup)) })
  }
  return out
}

/**
 * The old setup, built from the columns as they stand.
 *
 * ⚠️ `typed` IS EMPTY HERE **ON PURPOSE**: this setup is only ever handed to `applyPriceRule`, which
 * never reads it, and leaving it out of the shape would mean two different `PriceSetup` builders.
 */
export const oldSetupOf = (
  oldMode: string | null | undefined,
  oldAmount: number | string | null | undefined,
  oldRounding: string | null | undefined,
): PriceSetup => ({
  mode: isPriceMode(oldMode) ? oldMode : 'none',
  amount: oldAmount === null || oldAmount === undefined ? null : Number(oldAmount),
  rounding: isPriceRounding(oldRounding) ? oldRounding : 'none',
  typed: {},
})
