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
): Map<string, SlotIndicator> {
  const out = new Map<string, SlotIndicator>()
  if (!slots.length) return out

  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
  const back = projectBackwardOccupancy(productionSlotUnits, catConfigs, eventStartMins, kitchenCapacity)
  // The dot on collection slot T = collectability there = the cooking window ENDING at T
  // (keyed T−step), not the window starting at T (the off-by-one that showed the block one
  // slot early). step = finest prep cadence (exact for single-cadence; see helper note).
  const step = backwardWindowStepMins(catConfigs)

  for (const s of slots) {
    const w = back.byStart.get(toMins(s.collection_time) - step) ?? null
    let tone: SlotTone = w?.tone ?? 'green'
    if (s.too_soon && tone === 'green') tone = 'amber'
    const emoji = tone === 'red' ? '🔴' : tone === 'amber' ? '🟡' : '🟢'
    // Label = the window's per-category COMPOSITION as plain counts ("4 Pizza, 2 Other"),
    // shown on ALL tones — the colour conveys fullness, the text says what's actually in the
    // window. Built from w.byCat, which is already the capacity-counted set only (prep-bearing
    // seated here + no-prep-ticked; unticked no-prep like Drinks are absent) and is the SAME
    // window the tone is for. No denominators (operators know their own limits). Empty window
    // (no load, or a too_soon slot over a green oven) → '' so nothing odd renders. Replaces the
    // old binding "Pizza 4/4" / "Full" label — display-only; tone/emoji are untouched.
    const label = w
      ? Object.entries(w.byCat)
          .filter(([, n]) => Math.round(n) > 0)
          .map(([cat, n]) => `${Math.round(n)} ${capWord(cat)}`)
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
