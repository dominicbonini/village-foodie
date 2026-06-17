// lib/slot-display.ts
// SINGLE SOURCE for the operator slot traffic-light derived from the oven-occupancy
// projection. Both the Add Order panel and the Edit Order picker import this so their
// dots/labels can never diverge (DRY — see Fix E). The projection→tone/label mapping
// lives ONLY here; do not re-derive a count ratio at a call site.

import type { WindowOccupancy } from '@/lib/slot-availability'
import { projectBackwardOccupancy, backwardWindowStepMins } from '@/lib/slot-availability'
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
 *   tone   = the window's occupancy tone, from REAL cooking-window load ONLY (empty oven ⇒ green).
 *            too_soon does NOT affect the tone (the old too_soon→amber fold was removed) — it's a
 *            time/lead constraint, not oven load. So amber/red always carry real byCat load + a label.
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
  // eventStartMins + capacityWindowMins ARE read — they feed projectBackwardOccupancy (the dot now
  // reflects the BACKWARD cooking-window occupancy, the SAME engine buildSlotAvailability uses, not the
  // raw collection-slot total). All call sites (AddOrderPanel, Edit picker, /api/dashboard) already pass them.
  eventStartMins: number,
  /** Category names in MENU order (menu_categories.sort_order asc) — the same list/source the
   *  catConfigs come from. Used ONLY to order the composition label ("1 Pizza, 2 Others")
   *  so it matches the menu order the operator set. Categories absent from this list sort to
   *  the end (stable). Display-only: tone/engine are unaffected. */
  categoryOrder: string[] = [],
  capacityWindowMins: number = 5,
): Map<string, SlotIndicator> {
  const out = new Map<string, SlotIndicator>()
  if (!slots.length) return out

  // name(lowercase) → menu rank. Unknown categories → Infinity ⇒ sort to end, stable.
  const catRank = new Map(categoryOrder.map((name, i) => [name.toLowerCase(), i] as const))
  const rankOf = (cat: string) => catRank.get(cat.toLowerCase()) ?? Infinity
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

  // COOKING-load dots, sourced from the ENGINE (single source of truth — no re-derivation, no drift).
  // projectBackwardOccupancy seats each order's load BACKWARD into its cooking windows by batch/prep
  // cadence — driven purely by batch/prep, INDEPENDENT of collection_times/production_window_key
  // (pooling-free). E.g. 3 pizzas (batch 2, prep 5) collected 17:05 → window starting 16:55 = {pizza:2},
  // window starting 17:00 = {pizza:1}. A collection slot at T is served by the cooking window ENDING at
  // T (keyed startMins = T − step), EXACTLY as buildSlotAvailability's no-basket branch reads it, so the
  // dots AGREE with the engine (ASAP / fitOrderBackward / capacity veto — all on projectBackwardOccupancy).
  // Each window carries its OWN authoritative tone (per-category batch denominator + concurrencyAt /
  // kitchen-capacity ceiling) — we read that, never the raw collection-slot total (the old #10 bug).
  const capWindow = Math.max(1, Math.round(capacityWindowMins ?? 5))
  const back = projectBackwardOccupancy(productionSlotUnits, catConfigs, eventStartMins, kitchenCapacity, capWindow)
  const step = backwardWindowStepMins(catConfigs)

  for (const s of slots) {
    // The cooking window ENDING at this collection time (keyed startMins = T − step). Null ⇒ empty oven.
    const w = back.byStart.get(toMins(s.collection_time) - step) ?? null
    const tone: SlotTone = w?.tone ?? 'green'   // engine's tone: batch denominator + capacity ceiling
    const emoji = tone === 'red' ? '🔴' : tone === 'amber' ? '🟡' : '🟢'

    // Label = this window's per-category COOKING composition ("2 Pizza"), menu-ordered. Empty ⇒ ''.
    const label = w
      ? Object.entries(w.byCat)
          .filter(([, n]) => Math.round(Number(n)) > 0)
          .sort(([a], [b]) => rankOf(a) - rankOf(b))
          .map(([cat, rawN]) => {
            const count = Math.round(Number(rawN))
            const word = capWord(cat)
            // Pluralise when count != 1 (naive +s); singular at 1 ("1 Pizza"). Skip already-plural
            // names ("Sides", "Drinks") so we don't produce "Sidess".
            const display = count === 1 || word.endsWith('s') ? word : `${word}s`
            return `${count} ${display}`
          })
          .join(', ')
      : ''

    out.set(s.collection_time, { tone, emoji, label, occ: null as WindowOccupancy | null })
  }
  return out
}
