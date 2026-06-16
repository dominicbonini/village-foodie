// lib/slot-display.ts
// SINGLE SOURCE for the operator slot traffic-light derived from the oven-occupancy
// projection. Both the Add Order panel and the Edit Order picker import this so their
// dots/labels can never diverge (DRY — see Fix E). The projection→tone/label mapping
// lives ONLY here; do not re-derive a count ratio at a call site.

import type { WindowOccupancy } from '@/lib/slot-availability'
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
  /** The WINDOW key the WRITE stored load under = `timeMap[collection_time] || collection_time`
   *  (collection_times.production_slot, e.g. "19:20-19:30", collapsing two 5-min collection times
   *  into one shared 10-min capacity window). Pre-resolved server-side (the client has no DB access)
   *  and surfaced per-slot so the read mirrors the write on windowed trucks. Absent ⇒ falls back to
   *  collection_time (empty-collection_times trucks, where the write also keys by collection_time). */
  production_window_key?: string
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
  // eventStartMins + capacityWindowMins are no longer read (the dot now reflects the stored
  // collection-slot TOTAL, not a backward cooking-window projection). Kept in the signature so the
  // existing call sites (AddOrderPanel, the Edit picker, /api/dashboard) need no change.
  _eventStartMins: number,
  /** Category names in MENU order (menu_categories.sort_order asc) — the same list/source the
   *  catConfigs come from. Used ONLY to order the composition label ("1 Pizza, 2 Others")
   *  so it matches the menu order the operator set. Categories absent from this list sort to
   *  the end (stable). Display-only: tone/engine are unaffected. */
  categoryOrder: string[] = [],
  _capacityWindowMins: number = 5,
): Map<string, SlotIndicator> {
  const out = new Map<string, SlotIndicator>()
  if (!slots.length) return out

  // name(lowercase) → menu rank. Unknown categories → Infinity ⇒ sort to end, stable.
  const catRank = new Map(categoryOrder.map((name, i) => [name.toLowerCase(), i] as const))
  const rankOf = (cat: string) => catRank.get(cat.toLowerCase()) ?? Infinity
  const RANK: Record<SlotTone, number> = { green: 0, amber: 1, red: 2 }
  const EPS = 1e-6

  for (const s of slots) {
    // THE COLLECTION-SLOT TOTAL: the FULL load the operator committed to this slot's production window.
    // Keyed by the WINDOW key — the EXACT expression the WRITE uses (slot-bookings.ts:223/317/349):
    // `timeMap[collection_time] || collection_time`, pre-resolved server-side into s.production_window_key.
    // On a truck WITH collection_times window data this is the range key (e.g. "19:20-19:30") so two
    // collection times sharing a 10-min window share their load (and the read MATCHES the windowed write).
    // On an empty-collection_times truck production_window_key is absent ⇒ we fall back to s.collection_time,
    // which is ALSO what the write keys by there (timeMap empty ⇒ ct) — identical to the V7.5 #3 fix, so the
    // off-by-one (reading s.production_slot, the grid-collapsed value) is NOT reintroduced. DISPLAY ONLY.
    const units = productionSlotUnits[s.production_window_key ?? s.collection_time] || {}

    // Tone from the FULL total: each cooking (prep) category full/over its batch ⇒ red, partial ⇒
    // amber (worst wins, tie-break higher load); plus the global ceiling on capacity-counting items.
    // Empty ⇒ green. So 5 pizzas at a batch-4 slot ⇒ "5 Pizzas" RED (truthful: over one batch).
    let tone: SlotTone = 'green'
    let bound_by: string | null = null
    let bindRank = -1
    let bindUsed = -1
    let capTotal = 0
    for (const [catRaw, rawN] of Object.entries(units)) {
      const cat = catRaw.toLowerCase()
      const n = Number(rawN) || 0
      if (n <= 0) continue
      const cfg = catConfigs[cat]
      // Capacity-counting items feed the global ceiling: cooking cats always, instant cats only if
      // the operator ticked counts_toward_capacity (mirrors the engine's ceiling membership).
      if (cfg && (cfg.secs || cfg.countsToCapacity)) capTotal += n
      // Per-category batch tone — only cooking (prep) categories carry a batch denominator.
      if (cfg && cfg.secs) {
        const batch = Math.max(1, cfg.batch)
        const t: SlotTone = n >= batch - EPS ? 'red' : 'amber'
        const r = RANK[t]
        if (r > bindRank || (r === bindRank && n > bindUsed)) {
          bindRank = r; bindUsed = n
          tone = t; bound_by = `${capWord(cat)} ${Math.round(n)}/${Math.round(batch)}`
        }
      }
    }
    if (kitchenCapacity != null && capTotal >= kitchenCapacity - EPS) {
      tone = 'red'; bound_by = 'global ceiling'
    }
    const emoji = tone === 'red' ? '🔴' : tone === 'amber' ? '🟡' : '🟢'

    // Label = the slot's full per-category composition as plain counts ("5 Pizzas, 2 Others"),
    // menu-ordered (ALL booked categories incl. unticked no-prep like Drinks, since storage already
    // holds every booked item). Empty slot ⇒ '' (renders as a quiet green dot).
    const label = Object.entries(units)
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

    // occ retained for the SlotIndicator shape only — no live reader dereferences it (the dot/strip
    // read tone/emoji/label). Null is correct now the backward window is no longer computed here.
    void bound_by
    out.set(s.collection_time, { tone, emoji, label, occ: null as WindowOccupancy | null })
  }
  return out
}
