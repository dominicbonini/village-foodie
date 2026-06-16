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

  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

  // GROUP slots by their production WINDOW key — the EXACT key the WRITE stores load under
  // (slot-bookings.ts:223/317/349: `timeMap[collection_time] || collection_time`, pre-resolved into
  // s.production_window_key). On a windowed truck (slot_duration > interval, e.g. 10/5) several
  // collection times share one key (17:00 + 17:05 → "17:00-17:10") and are that window's batch
  // INTERVALS. On a non-windowed truck (slot_duration == interval, or empty collection_times) each
  // collection_time is its OWN key ⇒ single-member groups. Grouping needs the full slot list — all
  // call sites pass it (dashboard/route.ts, AddOrderPanel, dashboard/[token]/page.tsx). DISPLAY ONLY;
  // the engine still reads the un-distributed window total for capacity.
  const windowGroups = new Map<string, SlotInput[]>()
  for (const s of slots) {
    const key = s.production_window_key ?? s.collection_time
    const g = windowGroups.get(key)
    if (g) g.push(s); else windowGroups.set(key, [s])
  }

  for (const [key, groupSlots] of windowGroups) {
    // The WINDOW TOTAL the engine/write hold (e.g. {pizza:4}). We DISTRIBUTE it across the window's
    // member intervals so each dot shows what cooks in ITS batch interval, not the whole window total
    // echoed onto every member (the 10/5 over-display: 4 pizzas read as 4+4=8 across 17:00 and 17:05).
    const total = productionSlotUnits[key] || {}
    const members = [...groupSlots].sort((a, b) => toMins(a.collection_time) - toMins(b.collection_time))
    // DRAIN each category across the ordered members at batch_size cadence: each member gets
    // min(batch, remaining), EXCEPT the LAST member which absorbs ALL remaining. So overflow shows
    // truthfully on the last interval (never hidden), and a SINGLE-member (non-windowed) window — whose
    // only member is also the last — absorbs the whole total UNCAPPED, preserving the existing-correct
    // display (a one-interval slot with 4 pizzas still shows 4, not a batch-capped 2). Instant/no-prep
    // categories have no batch cadence ⇒ no cap ⇒ they fall to the first interval (not oven-batched).
    const perMember: QtyByCat[] = members.map((): QtyByCat => ({}))
    for (const [catRaw, rawN] of Object.entries(total)) {
      let remaining = Number(rawN) || 0
      if (remaining <= 0) continue
      const cfg = catConfigs[catRaw.toLowerCase()]
      const batch = cfg && cfg.secs ? Math.max(1, cfg.batch) : Number.POSITIVE_INFINITY
      for (let i = 0; i < members.length; i++) {
        const share = i === members.length - 1 ? remaining : Math.min(batch, remaining)
        if (share > 0) perMember[i][catRaw] = share
        remaining -= share
        if (remaining <= 0) break
      }
    }

    members.forEach((s, i) => {
      // Tone + label from THIS member's drained per-interval share (NOT the raw window total): each
      // cooking category at/over its batch this interval ⇒ red, partial ⇒ amber (worst wins, tie-break
      // higher load); plus the global ceiling on capacity-counting items. Empty interval ⇒ green.
      const units = perMember[i]
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

      // Label = this interval's per-category composition as plain counts ("2 Pizzas"), menu-ordered.
      // Empty interval ⇒ '' (renders as a quiet green dot).
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
    })
  }
  return out
}
