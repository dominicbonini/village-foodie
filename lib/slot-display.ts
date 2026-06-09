// lib/slot-display.ts
// SINGLE SOURCE for the operator slot traffic-light derived from the oven-occupancy
// projection. Both the Add Order panel and the Edit Order picker import this so their
// dots/labels can never diverge (DRY — see Fix E). The projection→tone/label mapping
// lives ONLY here; do not re-derive a count ratio at a call site.

import { projectBackwardOccupancy, type WindowOccupancy } from '@/lib/slot-availability'
import type { CatConfig } from '@/lib/prep-utils'
import type { QtyByCat } from '@/lib/slot-capacity'
import type { SlotTone } from '@/lib/slot-indicator'

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
 *   label  = '' (green) · the binding per-category count (e.g. "Pizza 4/4" / "2/4", from
 *            bound_by) · 'Full' only when red with no per-category binding (global ceiling).
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

  for (const s of slots) {
    const w = back.byStart.get(toMins(s.collection_time)) ?? null
    let tone: SlotTone = w?.tone ?? 'green'
    if (s.too_soon && tone === 'green') tone = 'amber'
    const emoji = tone === 'red' ? '🔴' : tone === 'amber' ? '🟡' : '🟢'
    const label = tone === 'green' ? '' : (w?.bound_by ?? (tone === 'red' ? 'Full' : ''))
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
