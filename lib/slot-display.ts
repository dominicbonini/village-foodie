// lib/slot-display.ts
// SINGLE SOURCE for the operator slot traffic-light derived from the oven-occupancy
// projection. Both the Add Order panel and the Edit Order picker import this so their
// dots/labels can never diverge (DRY — see Fix E). The projection→tone/label mapping
// lives ONLY here; do not re-derive a count ratio at a call site.

import { projectOvenOccupancy, type WindowOccupancy } from '@/lib/slot-availability'
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
 * Runs the shared projectOvenOccupancy over the slot list, then maps each window:
 *   tone   = the window's occupancy tone; a too_soon slot over a GREEN oven folds to
 *            amber so a too-soon slot is never shown green (timing).
 *   emoji  = 🟢 / 🟡 / 🔴.
 *   label  = '' (green) · 'Full' (red) · the binding per-category count (amber, from
 *            bound_by). Occupancy-driven amber always carries bound_by; a timing-only
 *            amber (too_soon over a green oven) has no binding category → no label.
 * Returns a Map keyed by collection_time. Empty Map when there are no slots.
 */
export function buildSlotIndicators(
  slots: SlotInput[],
  productionSlotUnits: Record<string, QtyByCat>,
  catConfigs: Record<string, CatConfig>,
  kitchenCapacity: number | null,
  windowSecs: number,
): Map<string, SlotIndicator> {
  const out = new Map<string, SlotIndicator>()
  if (!slots.length) return out

  const occByTime = new Map<string, WindowOccupancy>()
  for (const w of projectOvenOccupancy(
    slots.map(s => ({ collection_time: s.collection_time, production_slot: s.production_slot })),
    productionSlotUnits,
    catConfigs,
    kitchenCapacity,
    windowSecs,
  )) occByTime.set(w.collection_time, w)

  for (const s of slots) {
    const occ = occByTime.get(s.collection_time) ?? null
    let tone: SlotTone = occ?.tone ?? 'green'
    if (s.too_soon && tone === 'green') tone = 'amber'
    const emoji = tone === 'red' ? '🔴' : tone === 'amber' ? '🟡' : '🟢'
    const label = tone === 'green' ? '' : tone === 'red' ? 'Full' : (occ?.bound_by ?? '')
    out.set(s.collection_time, { tone, emoji, label, occ })
  }
  return out
}
