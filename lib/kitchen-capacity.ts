// lib/kitchen-capacity.ts
// SINGLE SOURCE for the kitchen-capacity description copy and the "needs prep
// config" warning, shared by the Manage Settings card and the dashboard
// Menu & Stock card so the two surfaces never drift (Manual s.14 / DRY s.3).
//
// 🔴 LANGUAGE PHASE 1d: THE WORDS LIVE IN messages/en-GB.json `kitchenCapacity` (US in en-US.json) — ONE
// explainer, read with `useT('kitchenCapacity')` by Menu › Kitchen capacity AND the dashboard's card (which
// read `dashboard.settings.capacityDesc` / `capacityExample` until then — two copies of one paragraph, and the
// two had already drifted: Manage's had straight apostrophes). The exports below are the same messages in
// en-GB, for the callers that have not moved yet.
import { translatorFor } from '@/lib/i18n/translator'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/kitchenCapacity'

const gb = translatorFor(DEFAULT_LOCALE, 'kitchenCapacity')

/** Canonical kitchen-capacity description — identical on both surfaces. */
export const KITCHEN_CAPACITY_DESC = gb('desc')

/** Canonical worked example — rendered as a second paragraph on both surfaces. */
export const KITCHEN_CAPACITY_EXAMPLE = gb('example')

/**
 * Canonical "how do I switch it off" line. Its wording is tied to the CONTROL: BatchSizeSelect
 * (components/manage/KitchenCapacityEdit.tsx:48) renders `<option value="">∞</option>` for null, so the
 * infinity symbol is literally what the operator sees. If that option's label ever changes, change this
 * line in the same commit — a help text naming a glyph the control no longer shows is worse than none.
 */
export const KITCHEN_CAPACITY_NO_LIMIT = gb('noLimit')

/** Canonical warning copy shown when capacity is set but categories are under-configured. */
export const KITCHEN_CAPACITY_WARNING = gb('warning')

// ── Shared kitchen-capacity GRID template (DRY §3) ─────────────────────────────
// ONE 4-column template — Category · Items · Prep · Counts — shared by the SIX sibling grids across
// three surfaces (dashboard capacity card, Manage Settings card, import-wizard kitchen-setup step); on
// EACH surface the category grid AND the aligned Total-capacity row use it so their columns line up.
// RESPONSIVE so it fits a phone: the old fixed columns (6.5+6.5+5.5rem ≈ 296px + gaps ≈ 332px) overflowed
// a ~311px phone, collapsing the flexible name column to 0 — so the "Category" header and "Total capacity"
// label overflowed their neighbours (the overlap) and the ceiling selects were pushed off-screen (the
// hidden total). Compact fixed columns on mobile keep the name column real-width; roomier at sm+ (desktop
// unchanged). Callers append their own gap-y / items / margin classes.
export const KITCHEN_CAPACITY_GRID =
  'grid grid-cols-[minmax(0,1fr)_5rem_5rem_2.5rem] gap-x-2 ' +
  'sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_5.5rem] sm:gap-x-3'

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

/**
 * Human label for a prep_secs value: "Instant" (0), "30s", "1m", "1m 30s", "2m", … "20m".
 * 🔴 THE WORDS AND UNITS ARE `kitchenCapacity.prepSecs.*` (Language Phase 1d), in `locale` — the truck's country's;
 * en-GB when absent, which is exactly the old text. The dashboard and Manage share it.
 */
export function formatPrepSecs(secs: number | null | undefined, locale?: string | null): string {
  const t = translatorFor(locale ?? DEFAULT_LOCALE, 'kitchenCapacity')
  const v = Number(secs) || 0
  if (v <= 0) return t('prepSecs.instant')
  const m = Math.floor(v / 60)
  const s = v % 60
  if (m === 0) return t('prepSecs.seconds', { s: String(s) })
  if (s === 0) return t('prepSecs.minutes', { m: String(m) })
  return t('prepSecs.minutesSeconds', { m: String(m), s: String(s) })
}

/**
 * Options to render for a category's stored prep_secs, with OFF-GRID PRESERVATION: always includes
 * 0 ("Instant") + the full grid, and if the stored value is a positive non-grid value (e.g. 330 =
 * 5m30s, 450 = 7m30s, 1200 = 20m — reachable via the old inputs) it is added as a selectable extra
 * so the dropdown can SELECT it without snapping. The component never writes on mount, so an
 * untouched off-grid category keeps its exact prep_secs (the engine-safety guarantee). Sorted asc.
 */
export function prepTimeOptionsFor(storedSecs: number | null | undefined, locale?: string | null): { secs: number; label: string }[] {
  const stored = Number(storedSecs) || 0
  const set = new Set<number>([0, ...PREP_TIME_OPTIONS])
  if (stored > 0) set.add(stored)                          // off-grid extra (no-op if already on grid)
  return [...set].sort((a, b) => a - b).map(secs => ({ secs, label: formatPrepSecs(secs, locale) }))
}
