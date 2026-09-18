// lib/slot-display.ts
// SINGLE SOURCE for the operator slot traffic-light derived from the oven-occupancy
// projection. Both the Add Order panel and the Edit Order picker import this so their
// dots/labels can never diverge (DRY — see Fix E). The projection→tone/label mapping
// lives ONLY here; do not re-derive a count ratio at a call site.

import type { WindowOccupancy } from '@/lib/slot-availability'
import { projectBackwardOccupancy, backwardWindowStepMins, dotOccupancyAt, type EngineReservation, type DotOverlap, type DotRead } from '@/lib/slot-availability'
import type { CatConfig } from '@/lib/prep-utils'
import type { QtyByCat } from '@/lib/slot-capacity'
import type { SlotTone } from '@/lib/slot-indicator'

/** Capitalise a lowercase byCat key for display ("pizza" → "Pizza"), matching the engine's capWord. */
const capWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface SlotIndicator {
  tone: SlotTone
  emoji: string
  label: string
  /** Units this window is STRICTLY OVER the kitchen_capacity ceiling; 0 when it is at-or-under.
   *
   *  `tone` alone cannot express this: it goes red at `conc >= ceiling` (slot-availability.ts:737),
   *  so a legitimately FULL window and a genuinely over-subscribed one render identically. This is
   *  the same strictly-over test the breach detector applies (`remainingTotal < -EPS`,
   *  lib/capacity-breach.ts:100) — full is not over. Read by the pickers to mark over-capacity slots.
   *  Display-only: it never feeds tone, placement or any fit decision. */
  overTotal: number
  /** Raw occupancy for capacity fit-checks (cookingByCat / rateByCat / totalCooking).
   *  Same data the tone/label derive from — consumers must not recompute a parallel calc. */
  occ: WindowOccupancy | null
  /** 18 September 2026: the binding rolling limit at this time when a batch that merely OVERLAPS it (not
   *  booked at it) makes it fuller than its own window shows. null ⇒ the label is today's composition
   *  (or empty). See dotOccupancyAt. */
  overlap: DotOverlap | null
  /** True when `label` is this time's OWN composition ("8 Pizzas"). Such a label is never replaced. */
  ownLabel: boolean
}

/**
 * THE ONE COUNT RENDERER — "8 Pizzas", "1 Pizza", "2 Pizzas, 1 Other" — menu-ordered, plural-aware.
 *
 * 🔴 BOTH LABEL PATHS CALL IT (19 September 2026), which is the point. A dot's label is now always a
 * count of what is cooking: either this time's OWN cooking window (`byCat`, unchanged since the dots were
 * built) or, when the time has no window of its own, the ROLLING load of the batch that overlaps it. One
 * renderer means the two can never be formatted differently — "8 Pizzas" reads the same whether the batch
 * is collected at this time or merely shares the grill with it.
 *
 * ⚠️ WHAT THIS REPLACED. `formatOverlapLabel` used to describe an overlapped time in words rather than
 * counts: "Full", "Pizza full", "Kitchen full", "{n} free", "Pizza: {n} free", "Kitchen: {n} free". An
 * operator looking at 21:50 was told the state of a limit but not what was in the oven, and the free-space
 * forms answered a question ("how much room") that the count answers better ("8 of your 8-batch"). All six
 * strings are gone; the colour still carries fullness, and the popup still explains a refusal in full.
 */
function countLabel(entries: Array<[string, number]>, rankOf: (cat: string) => number): string {
  return entries
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
}

/**
 * THE FIT SUFFIX — the basket-aware verdict appended after a dot's own label, on the operator surfaces
 * that have an order in progress. "Not enough time", and only where it tells the operator something new.
 *
 * 🔴 NOT SHOWN ON A RED DOT (19 September 2026). A red dot already says the kitchen cannot take more
 * here — "Full · Order won't fit" said it twice, and on a time with a count ("16 Pizzas · Order won't
 * fit") the two halves read as if they were about different things. The suffix now earns its place only
 * on GREEN and AMBER: a time that looks like it has room, for an order that nevertheless does not fit —
 * which is exactly the case the operator cannot work out from the colour.
 * 🔴 IT SAYS WHY, NOT THAT (19 September 2026). "Won't fit" (and before it "Order won't fit") named the
 * outcome and left the operator to guess the cause — the usual guess being "the truck is full", which on a
 * green dot contradicts what they are looking at. The refusal is always the same thing: the food cannot be
 * COOKED IN TIME to be ready by that collection time, because the windows behind it are already busy.
 * "Not enough time" is that sentence, and it matches the popup's own first line.
 *
 * Separators UNCHANGED: " · " after an existing label ("3 Pizzas · Not enough time"); a single space after
 * a bare dot ("17:30 🟢 Not enough time"). The old bare-dot " – " form stays gone FROM THIS LABEL ONLY —
 * the en dash is untouched everywhere else (the grace row's "⚠️ 21:05 · After closing" and the rest).
 *
 * ⚠️ THIS IS NOT THE POPUP. lib/slot-fit-message.ts opens "Can't be ready by 18:45" and lists every window
 * and its free room; that is the one place the operator reads WHY in full, and its LINES are untouched.
 */
export function formatFitSuffix(tone: SlotTone, doesNotFit: boolean, hasLabel: boolean): string {
  if (!doesNotFit || tone === 'red') return ''
  return hasLabel ? ' · Not enough time' : ' Not enough time'
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
  /** 🔴 The DISPLAYED grid's interval. 5 (default) ⇒ the original single-window read, unchanged; 10–30 ⇒
   *  coverDotWindows, so every cooking window lands on exactly one dot. Display only. */
  intervalMins: number = 5,
  /** P1: per-order cooking reservations; empty ⇒ today's dots exactly. */
  reservations: EngineReservation[] = [],
  /** P3: the per-truck switch; false ⇒ P2 exactly. */
  batchReservations: boolean = false,
): Map<string, SlotIndicator> {
  const out = new Map<string, SlotIndicator>()
  if (!slots.length) return out

  // name(lowercase) → menu rank. Unknown categories → Infinity ⇒ sort to end, stable.
  const catRank = new Map(categoryOrder.map((name, i) => [name.toLowerCase(), i] as const))
  const rankOf = (cat: string) => catRank.get(cat.toLowerCase()) ?? Infinity
  // Each cooking category's batch exactly as projectBackwardOccupancy records it (`Math.max(1, cfg.batch)`,
  // lowercase key), so `batch − remainingByCat[cat]` below recovers the rolling load the tone used.
  const batchOf = new Map<string, number>()
  for (const [catRaw, cfg] of Object.entries(catConfigs)) if (cfg && cfg.secs) batchOf.set(catRaw.toLowerCase(), Math.max(1, cfg.batch))
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
  // The displayed grid in minute order, for the "previous dot" each dot covers back to (10–30 only).
  const orderedMins = slots.map(s => toMins(s.collection_time)).sort((a, b) => a - b)
  const prevOf = (m: number): number | null => { const i = orderedMins.indexOf(m); return i > 0 ? orderedMins[i - 1] : null }

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
  const back = projectBackwardOccupancy(productionSlotUnits, catConfigs, eventStartMins, kitchenCapacity, capWindow, reservations, batchReservations)
  const step = backwardWindowStepMins(catConfigs)

  // 18 September 2026: every dot is ONE read — dotOccupancyAt — whose `window` is exactly the line this
  // loop used to hold (pile ?? window ending at T ?? null at 5; coverDotWindows at 10–30) and whose tone
  // also reflects a batch that merely OVERLAPS T on a grid finer than the prep.
  // 19 September 2026: the forward scan that named the next free time is GONE with the wording it fed —
  // see formatOverlapLabel. Nothing looks ahead here any more.
  const reads = new Map<string, DotRead>()
  for (const s of slots) reads.set(s.collection_time, dotOccupancyAt(back, toMins(s.collection_time), prevOf(toMins(s.collection_time)), step, eventStartMins, catConfigs, kitchenCapacity, intervalMins, batchReservations, rankOf))

  let slotIndex = -1
  for (const s of slots) {
    slotIndex++
    const read = reads.get(s.collection_time)!
    const w = read.window
    const tone: SlotTone = read.tone                // window tone, or the overlap's when that is worse
    const emoji = tone === 'red' ? '🔴' : tone === 'amber' ? '🟡' : '🟢'

    // Label = this window's per-category COOKING composition ("2 Pizza"), menu-ordered. Empty ⇒ ''.
    // ── THE NUMBER THE COLOUR WAS DECIDED FROM (19 September 2026) ──────────────────────────────
    // ── THE LABEL IS THE TOTAL COOKED IN THE STRETCH THIS DOT COVERS (19 September 2026) ──────────
    // `spanTotal` = every batch of the category that overlaps [T − max(prep, grid), T), each counted ONCE.
    //
    // 🔴 WHY THE SPAN IS max(prep, grid), NOT JUST THE PREP. A dot stands for the stretch of kitchen time
    // between it and the time before it. When the grid is FINER than the prep (15-minute cook, 5-minute
    // times) one cooking window reaches back past several listed times, so the span is the prep: the same
    // batch of 8 is named on each time it covers — "8 Pizzas", not 16, because it is counted once. When
    // the grid is WIDER than the prep (5-minute cook, 10-minute times) one dot covers SEVERAL consecutive
    // batches, and the operator wants to know what comes out of that ten minutes: two full batches of 2
    // read "4 Pizzas". Both are "what is cooked in the stretch this dot covers"; max() is that sentence.
    //
    // 🔴 THE COLOUR IS UNCHANGED, AND IT IS A DIFFERENT QUESTION. Tone still comes from dotOccupancyAt —
    // the PEAK concurrent load against the batch and the kitchen cap, "is the oven over-full at any
    // instant". The label answers "how much food is this". They can legitimately disagree: two back-to-back
    // batches of 2 total 4 with a peak of 2, so the dot stays amber and reads "4 Pizzas". Nothing is
    // overbooked; the number is the stretch's output, not its concurrency.
    //
    // 🔴 WHERE THE GRID EQUALS THE PREP — Gusto's 5 on 5, and 15 on 15 — each dot covers exactly one
    // cooking window, so total == peak and every label is byte-identical to before (measured: 160 states,
    // 0 differ). Wider multiples are what this change is for.
    //
    // UNCHANGED, each by an explicit branch: §31's event-start PILE keeps its raw piled count, and a
    // ticked no-prep category keeps its own ticked count (it has no batch and no cooking span).
    const spanNumber = (cat: string, own: number): number => {
      const c = cat.toLowerCase()
      if (!batchOf.has(c)) return own                             // instant, ticked category: its own count
      const T = toMins(s.collection_time)
      // §31 pile: the RAW piled count. The pile is only ever in play on the dot that READS it — the dot AT
      // the event start on a 5-minute grid, or the FIRST listed dot on a 10–30 grid, where coverDotWindows
      // folds it in. `pileByStart` is keyed at the event start, and an ordinary cooking window can start
      // there too, so testing the key alone wrongly silenced the run-up window's own total.
      if (w && back.pileByStart.has(w.startMins) && (T === eventStartMins || slotIndex === 0)) return own
      const prep = Math.max(1, Math.round((catConfigs[c]?.secs ?? 0) / 60))
      const from = T - Math.max(prep, intervalMins)
      let total = 0
      for (const iv of back.intervals) {
        if (iv.cat !== c || iv.items <= 0 || iv.endMins <= iv.startMins) continue
        if (iv.startMins < T && from < iv.endMins) total += iv.items          // half-open, each batch once
      }
      // 🔴 THE FLOOR IS GONE (19 September 2026). The total used to be lifted to the window tone's own
      // number so a red dot could never read below what made it red. It existed only to paper over
      // coverDotWindows returning a NEIGHBOURING window's record: on a grid wider than the prep the dot
      // took the fullest covered window's `remainingByCat`, which measured that window's own span, and
      // the floor then printed it here — Dominic's 12:15 read "8 Pizzas" over a stretch holding 4.
      // coverDotWindows now builds the record for the dot's OWN stretch, so the tone's number IS this
      // stretch's peak and the total is never below it. Measured after the fix: across 700 seeded states
      // (preps 5/10/15, batches 2/4/8, grids 5/10/15/30, ceilings, instants, switch ON and OFF) the floor
      // changed NOT ONE label. The count is now simply the truth about this dot's stretch.
      return total
    }
    const rawLabel = w ? countLabel(Object.entries(w.byCat).map(([cat, n]) => [cat, spanNumber(cat, Number(n))] as [string, number]), rankOf) : ''
    // 🔴 NO "peak" PREFIX (19 September 2026). A dot on a grid wider than the prep covers several cooking
    // windows, and its count is the peak concurrency across them rather than their total. The label used
    // to say so — "peak 2 Pizzas" — on the theory that a bare "2 Pizzas" over a 15-minute span might be
    // read as the span's sum. In the kitchen it read as jargon: every other dot in the same list says
    // "2 Pizzas", and an operator comparing them has no way to know what the extra word changes. The
    // number is what it always was; only the word is gone, so every label in the list now has one form.
    // The window's own `peak` FLAG stays (coverDotWindows sets it, and `SlotIndicator.ownLabel` and the
    // harnesses read the shape) — renaming it would touch the engine for a wording change.
    const ownLabel = rawLabel
    // ── WHAT IS COOKING FOR THIS TIME (19 September 2026) ─────────────────────────────────────────
    // The colour is max(window tone, rolling tone) — dotOccupancyAt. When the rolling read over
    // [T − prep, T) is STRICTLY worse than the window's own (`read.overlap` set), the colour came from
    // it, so the label reads its numbers: `read.perCat[cat].used`, every batch overlapping that span,
    // which is how a batch spanning four listed times reads "8 Pizzas" on all four. Otherwise the window
    // decided the colour and the label is the window's — `ownLabel`, with the tone's numbers above. A
    // ticked no-prep category keeps its place either way (`instants`). `read.overlap` is null at every
    // time of an aligned grid (the tone sweep proves it: the colour never differs from the window's), so
    // this branch never runs there and aligned trucks render exactly as they did.
    const instants = w ? Object.entries(w.byCat).filter(([cat]) => !batchOf.has(cat.toLowerCase())).map(([cat, n]) => [cat, Number(n)] as [string, number]) : []
    const overlap = read.overlap
    const label = overlap
      ? countLabel([...Object.entries(read.perCat).map(([cat]) => [cat, spanNumber(cat, 0)] as [string, number]), ...instants], rankOf)
      : ownLabel

    // STRICTLY over only — same rule (and same raw field) as the breach detector. `remainingTotal`
    // is Infinity when no ceiling is set, so the subtraction can never produce a false positive.
    const overTotal = w && w.remainingTotal < -1e-9 ? Math.round(-w.remainingTotal) : 0

    out.set(s.collection_time, { tone, emoji, label, overTotal, occ: null as WindowOccupancy | null, overlap, ownLabel: !!ownLabel })
  }
  return out
}
