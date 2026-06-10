// lib/kitchen-capacity.ts
// SINGLE SOURCE for the kitchen-capacity description copy and the "needs prep
// config" warning, shared by the Manage Settings card and the dashboard
// Menu & Stock card so the two surfaces never drift (Manual s.14 / DRY s.3).

/** Canonical kitchen-capacity description — identical on both surfaces. */
export const KITCHEN_CAPACITY_DESC =
  "The most items you can make in one 5-minute window, across the categories selected " +
  "below. Each cooked category's prep time and batch size set how fast it can be made; " +
  "this is the shared ceiling across everything. Leave as No limit for none."

/** Canonical worked example — rendered as a second paragraph on both surfaces. */
export const KITCHEN_CAPACITY_EXAMPLE =
  "Example: capacity 6, Pizza in batches of 4. A window can hold up to 4 pizzas, and the " +
  "remaining 2 can be sides or drinks — so 4 pizzas + 2 sides fills it, or 2 pizzas + 4 " +
  "sides. The batch (4) limits pizzas; the ceiling (6) limits the total."

/** Canonical warning copy shown when capacity is set but categories are under-configured. */
export const KITCHEN_CAPACITY_WARNING =
  "⚠️ For kitchen capacity to work properly, set a prep time and batch size on " +
  "your menu categories (Menu & Stock). Without them, capacity can't tell how long " +
  "items take to cook."

type CatPrep = { prep_secs?: number | null; batch_size?: number | null }

/**
 * A category that shows cooking intent but is only PARTIALLY configured, so kitchen
 * capacity can't compute its batches. Fully-instant categories (no prep AND no real
 * batch — e.g. drinks) are intentional and never warned about (Manual s.14: instant
 * items don't count). Fully-configured cooking categories (prep>0 AND batch>=1) are
 * fine. Only the half-configured middle triggers the warning.
 */
export function categoryNeedsPrepConfig(c: CatPrep): boolean {
  const prep = c.prep_secs ?? 0
  const batch = c.batch_size ?? 0
  const cooks = prep > 0 || batch > 1          // some cooking intent expressed
  const fullyConfigured = prep > 0 && batch >= 1
  return cooks && !fullyConfigured
}

/**
 * True when the warning box should show: capacity is set to a number AND at least
 * one category is partially configured. No warning when capacity is No limit (null)
 * or when every category is either fully-configured or intentionally instant.
 */
export function kitchenCapacityNeedsPrepWarning(
  capacity: number | null | undefined,
  categories: CatPrep[] | null | undefined
): boolean {
  if (capacity == null) return false
  return (categories || []).some(categoryNeedsPrepConfig)
}
