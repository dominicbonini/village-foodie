// lib/kitchen-capacity.ts
// SINGLE SOURCE for the kitchen-capacity description copy and the "needs prep
// config" warning, shared by the Manage Settings card and the dashboard
// Menu & Stock card so the two surfaces never drift (Manual s.14 / DRY s.3).

/** Canonical kitchen-capacity description — identical on both surfaces. */
export const KITCHEN_CAPACITY_DESC =
  "The most items your kitchen can cook at once across the ticked categories — " +
  "each cooked category's batch size still caps how many of that item fit in it."

/** Canonical worked example — rendered as a second paragraph on both surfaces. */
export const KITCHEN_CAPACITY_EXAMPLE =
  "Example: with a ceiling of 5 and pizzas in batches of 4, one window could be 4 pizzas " +
  "+ 1 side, or 3 pizzas + 2 sides — the batch (4) caps pizzas, the ceiling (5) caps the total."

/** Canonical warning copy shown when capacity is set but categories are under-configured. */
export const KITCHEN_CAPACITY_WARNING =
  "⚠️ For kitchen capacity to work properly, set a prep time and batch size on " +
  "your menu categories (Menu & Stock). Without them, capacity can't tell how long " +
  "items take to cook."

/**
 * Canonical "How kitchen setup works" explainer — the per-category prep/batch walkthrough shown on the
 * import wizard's Kitchen-setup step (and reusable by the Phase-2 shared <KitchenCapacityEdit>). ONE
 * source so the wording never drifts. (Distinct from KITCHEN_CAPACITY_* above, which describe the
 * event-level capacity CEILING — this describes setting up a single category's prep time + batch.)
 */
export const KITCHEN_SETUP_EXPLAINER = {
  title: 'How kitchen setup works',
  example:
    'If your kitchen can cook 10 pizzas every 10 minutes, set Pizza to 10 min prep and 10 items at a ' +
    'time. Once 10 pizza items are in progress, the next customer is automatically told their order ' +
    'takes 20 minutes.',
  instant:
    'Items like drinks or dips that are ready instantly can be left as "No wait time" and "No limit".',
  window:
    'You can also set a maximum orders-per-window limit when creating an event — this acts as a safety ' +
    'cap across all categories combined.',
} as const

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

// ── Shared prep-time dropdown grid (V7.8 §42) ──────────────────────────────────
// ONE source for the prep-time <select> on BOTH the dashboard Menu & Stock section and the Manage
// category editor (replaces the old minutes-input + 0s/30s-select pair, and Manage's whole-minutes
// input). VALUE = prep_secs in SECONDS — fed straight to the existing writes (updateCategoryField /
// upsert_category) with NO payload change. Mirrors the SCHEDULE_TIME_OPTIONS pattern.
//   30s steps 30s→5m (30,60,…,300), then 1m steps 6m→15m (360,420,…,900). ~20 options.
export const PREP_TIME_OPTIONS: number[] = [
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * 30),   // 30,60,90,…,300  (30s … 5m)
  ...Array.from({ length: 10 }, (_, i) => 360 + i * 60),    // 360,420,…,900   (6m … 15m)
]

/** Human label for a prep_secs value: "Instant" (0), "30s", "1m", "1m 30s", "2m", … "20m". */
export function formatPrepSecs(secs: number | null | undefined): string {
  const v = Number(secs) || 0
  if (v <= 0) return 'Instant'
  const m = Math.floor(v / 60)
  const s = v % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

/**
 * Options to render for a category's stored prep_secs, with OFF-GRID PRESERVATION: always includes
 * 0 ("Instant") + the full grid, and if the stored value is a positive non-grid value (e.g. 330 =
 * 5m30s, 450 = 7m30s, 1200 = 20m — reachable via the old inputs) it is added as a selectable extra
 * so the dropdown can SELECT it without snapping. The component never writes on mount, so an
 * untouched off-grid category keeps its exact prep_secs (the engine-safety guarantee). Sorted asc.
 */
export function prepTimeOptionsFor(storedSecs: number | null | undefined): { secs: number; label: string }[] {
  const stored = Number(storedSecs) || 0
  const set = new Set<number>([0, ...PREP_TIME_OPTIONS])
  if (stored > 0) set.add(stored)                          // off-grid extra (no-op if already on grid)
  return [...set].sort((a, b) => a - b).map(secs => ({ secs, label: formatPrepSecs(secs) }))
}
