// lib/slot-display.ts
// SINGLE SOURCE for the operator slot traffic-light derived from the oven-occupancy
// projection. Both the Add Order panel and the Edit Order picker import this so their
// dots/labels can never diverge (DRY — see Fix E). The projection→tone/label mapping
// lives ONLY here; do not re-derive a count ratio at a call site.

import { projectBackwardOccupancy, backwardWindowStepMins, type WindowOccupancy } from '@/lib/slot-availability'
import type { CatConfig } from '@/lib/prep-utils'
import type { QtyByCat } from '@/lib/slot-capacity'
import type { SlotTone } from '@/lib/slot-indicator'

/** Capitalise a lowercase byCat key for display ("pizza" → "Pizza"), matching the engine's capWord. */
const capWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface SlotIndicator {
  tone: SlotTone
  emoji: string
  label: string
  /** Raw occupancy for capacity fit-checks (cookingByCat / rateByCat / totalCooking).
   *  Same data the tone/label derive from — consumers must not recompute a parallel calc. */
  occ: WindowOccupancy | null
}

interface SlotInput {
  collection_time: string
  production_slot: string
  too_soon?: boolean
}

/**
 * Per-slot oven-occupancy indicator (tone + emoji + binding "Pizza 2/4" label).
 * STAGE 2: now reads the BACKWARD occupancy map (projectBackwardOccupancy) — load lives in
 * the COOKING windows before collection, so the dot at picker slot S shows the window
 * STARTING at S (e.g. 10 pizzas @19:00 → 18:45 "Pizza 4/4" red, 18:50 "4/4" red, 18:55
 * "2/4" amber, 19:00+ green). The red/amber/green RULE is unchanged (full ⇒ red, partial ⇒
 * amber, empty ⇒ green) — only WHICH window each dot reads is now physically correct.
 *   tone   = the window's occupancy tone; a too_soon slot over a GREEN oven folds to amber.
 *   emoji  = 🟢 / 🟡 / 🔴.
 *   label  = the window's per-category COMPOSITION as plain counts ("4 Pizza, 2 Other"),
 *            shown on every tone; '' when the window is empty. byCat is already capacity-
 *            counted-only (unticked no-prep excluded). No denominators — operators know their
 *            own limits; the colour conveys fullness, the text says what's in the window.
 * Returns a Map keyed by collection_time. Empty Map when there are no slots.
 */
export function buildSlotIndicators(
  slots: SlotInput[],
  productionSlotUnits: Record<string, QtyByCat>,
  catConfigs: Record<string, CatConfig>,
  kitchenCapacity: number | null,
  eventStartMins: number,
  /** Category names in MENU order (menu_categories.sort_order asc) — the same list/source the
   *  catConfigs come from. Used ONLY to order the composition label ("1 Pizza, 2 Others")
   *  so it matches the menu order the operator set. Categories absent from this list sort to
   *  the end (stable). Display-only: tone/engine/occ are unaffected. */
  categoryOrder: string[] = [],
  /** The global ceiling's own window cadence (capacity_window_mins). Default 5. */
  capacityWindowMins: number = 5,
): Map<string, SlotIndicator> {
  const out = new Map<string, SlotIndicator>()
  if (!slots.length) return out

  // name(lowercase) → menu rank. Unknown categories → Infinity ⇒ sort to end, stable.
  const catRank = new Map(categoryOrder.map((name, i) => [name.toLowerCase(), i] as const))
  const rankOf = (cat: string) => catRank.get(cat.toLowerCase()) ?? Infinity

  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
  const back = projectBackwardOccupancy(productionSlotUnits, catConfigs, eventStartMins, kitchenCapacity, capacityWindowMins)
  // The dot on collection slot T = collectability there = the cooking window ENDING at T
  // (keyed T−step), not the window starting at T (the off-by-one that showed the block one
  // slot early). step = finest prep cadence (exact for single-cadence; see helper note).
  const step = backwardWindowStepMins(catConfigs)
  // Composition shows the PHYSICAL booked load per window (ALL categories, every order source —
  // "what's in the slot"), independent of the capacity TONE. The capacity map (`back`) omits
  // unticked no-prep categories (they don't gate), so it can't answer "what's physically booked".
  // We re-project with every category forced counts_toward_capacity, which additionally seats the
  // unticked no-prep cats (e.g. Drinks) into their collection-adjacent window. Same
  // productionSlotUnits + prep cadences ⇒ identical step + window keys (T−step), so the
  // composition describes EXACTLY the window whose colour is shown. Tone/occ still read `back`
  // (capacity), so walk-up bypass keeps the colour unchanged — only the text widens. Note: items
  // never booked into productionSlotUnits (e.g. a walk-up with no resolved event_id) are absent
  // from BOTH maps — a booking-scope gap, not fixable in the indicator.
  const physicalConfigs: Record<string, CatConfig> = {}
  for (const [cat, cfg] of Object.entries(catConfigs)) physicalConfigs[cat] = { ...cfg, countsToCapacity: true }
  const physical = projectBackwardOccupancy(productionSlotUnits, physicalConfigs, eventStartMins, kitchenCapacity, capacityWindowMins)

  for (const s of slots) {
    const w = back.byStart.get(toMins(s.collection_time) - step) ?? null
    const pw = physical.byStart.get(toMins(s.collection_time) - step) ?? null
    let tone: SlotTone = w?.tone ?? 'green'
    if (s.too_soon && tone === 'green') tone = 'amber'
    const emoji = tone === 'red' ? '🔴' : tone === 'amber' ? '🟡' : '🟢'
    // Label = the window's per-category COMPOSITION as plain counts ("4 Pizzas, 2 Others"), shown
    // on ALL tones — the colour conveys fullness, the text says what's PHYSICALLY in the window.
    // Built from the PHYSICAL projection (pw.byCat): every booked category incl. unticked no-prep
    // (Drinks) and every order source, NOT the capacity-seated w.byCat. Same window key (T−step)
    // as the tone. No denominators. Empty window (no load / too_soon over a green oven) → '' so
    // nothing odd renders.
    const label = pw
      ? Object.entries(pw.byCat)
          .filter(([, n]) => Math.round(n) > 0)
          // Order by the category's menu sort_order (ascending) so the composition reads in the
          // same order as the menu/settings ("1 Pizza, 2 Others"), not object-key order. Array
          // .sort is stable, so unknown categories (rank Infinity) hold their order at the end.
          .sort(([a], [b]) => rankOf(a) - rankOf(b))
          .map(([cat, n]) => {
            const count = Math.round(n)
            const word = capWord(cat)
            // Pluralise when count != 1 (naive +s); singular at 1 ("1 Pizza"). Skip names that
            // are already plural ("Sides", "Drinks") so we don't produce "Sidess".
            const display = count === 1 || word.endsWith('s') ? word : `${word}s`
            return `${count} ${display}`
          })
          .join(', ')
      : ''
    // Reconstruct a WindowOccupancy-shaped `occ` for back-compat (the SlotIndicator type;
    // no live reader dereferences it today). rate = batch per category in this window.
    const occ: WindowOccupancy | null = w ? {
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      tone: w.tone,
      bound_by: w.bound_by,
      cookingByCat: w.byCat,
      rateByCat: Object.fromEntries(Object.keys(w.byCat).map(c => [c, back.batchByCat[c] ?? w.byCat[c]])),
      totalCooking: w.total,
    } : null
    out.set(s.collection_time, { tone, emoji, label, occ })
  }
  return out
}
