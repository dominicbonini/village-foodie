// lib/slot-fit-message.ts
// ── "ORDER WON'T FIT" — THE WORDS, BUILT ONLY FROM fitOrderBackward's `why` (18 September 2026) ─────
//
// 🔴 THIS MODULE DOES NO ARITHMETIC ABOUT CAPACITY. Every number it prints was recorded by
// fitOrderBackward at the moment that verdict was taken (lib/slot-availability.ts, FitWhy). It formats
// and it pluralises; it never adds, compares against a ceiling, or decides anything.
//
// ── WHY THE OLD WORDING WAS REPLACED ───────────────────────────────────────────────────────────────
// The old confirm re-derived its own figures from `bound_by` and said, for 9 pizzas at 18:45 on an
// 8-batch grill: "Pizza can be made 8 at a time. Around 18:15–18:45 it would need 16." 🔴 SIXTEEN IS
// NOT A THING THAT EXISTS. It is two separate batches — 8 already cooking in one window, 8 of this
// order in the same window — summed into a number no oven will ever hold and no operator can act on.
// It also hid the real answer: ONE of the two batches this order needs has room, the other is full.
// So the rule below is: NEVER PRINT A TOTAL LARGER THAN ONE BATCH OR THE KITCHEN CAP. Print the
// windows, and for each, what is in it and what is free.
import type { FitWhy } from '@/lib/slot-availability'

export interface FitMessage {
  /** "Can\u2019t be ready by 18:45" (19 September 2026; was "Order won't fit at 18:45" — it named the
   *  outcome, not the reason, and every line beneath it is about COOKING TIME). The lines are unchanged. */
  title: string
  /** One sentence per blocking reason, each followed by its own window lines. Render in order. */
  lines: string[]
}

/** Minutes from midnight → "HH:MM", day-wrapped like the rest of the engine's display helpers. */
export function fitMins(m: number): string {
  const v = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

/**
 * Turn `why` into the operator's popup.
 *
 * @param slotLabel  the collection time as displayed, e.g. "18:45" — every sentence ends at it.
 * @param catLabel   engine key → the category's display name EXACTLY AS STORED. The engine only ever
 *                   sees a lowercase key (orderItemsToQtyByCat lowercases), and menu_categories.name is
 *                   the truck's own spelling, so the caller — which holds that map — supplies it. The
 *                   fallback capitalises, which is only ever reached for a category that has vanished
 *                   from the menu between the fit and the render.
 */
export function buildFitMessage(args: { slotLabel: string; why: FitWhy; catLabel?: (cat: string) => string }): FitMessage {
  const { slotLabel, why } = args
  const label = (cat: string) => args.catLabel?.(cat) || (cat.charAt(0).toUpperCase() + cat.slice(1))
  const lines: string[] = []

  for (const w of why) {
    if (w.kind === 'batch') {
      const Cat = label(w.cat)
      lines.push(`${Cat}: ${w.batch} at a time, every ${w.prepMins} minutes.`)
      const N = w.windows.length
      // M = windows that could take this order's share as it stands. A category only appears in `why`
      // when at least one of its windows is OVER, so M < N always — the M === N arm below is
      // unreachable by construction and exists so a future change cannot produce a missing sentence.
      const M = w.windows.filter(x => x.free >= x.share).length
      if (N === 1) {
        lines.push(`This order needs 1 batch to be ready by ${slotLabel}, and it doesn't have room.`)
      } else if (M === 0) {
        lines.push(`This order needs ${N} batches to be ready by ${slotLabel}, and none has room.`)
      } else if (M === 1) {
        lines.push(`This order needs ${N} batches to be ready by ${slotLabel}, but only 1 has room.`)
      } else {
        lines.push(`This order needs ${N} batches to be ready by ${slotLabel}, but only ${M} have room.`)
      }
      for (const win of w.windows) {
        const span = `${fitMins(win.startMins)}–${fitMins(win.endMins)} · ${Cat}`
        if (win.free <= 0) lines.push(`${span} · Full`)
        else if (win.free >= win.share) lines.push(`${span} · ${win.free} free`)
        else lines.push(`${span} · ${win.free} free, needs ${win.share}`)
      }
    } else if (w.kind === 'kitchen') {
      lines.push(`Your kitchen cooks up to ${w.cap} items at a time. Between ${fitMins(w.startMins)} and ${fitMins(w.endMins)} it's already cooking ${w.existing}, and this order needs ${w.add} more.`)
    } else {
      lines.push(`${label(w.cat)} for ${slotLabel} would need to start cooking before your event opens.`)
    }
  }
  return { title: `Can\u2019t be ready by ${slotLabel}`, lines }
}
