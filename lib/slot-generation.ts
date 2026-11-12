// Generates collection time slots for an event based on truck config.
// Each slot gets a production_slot (batch window) by rounding down to the
// nearest slot_duration_mins boundary.
//
// ── 🔴 START-ANCHORED (collection-anchor-1, 12 November 2026; was clock-anchored from midnight, decision D1) ──────
// Selectable times are counted FROM THE EVENT'S START at EVERY interval: start, start + interval,
// start + 2×interval … to the last one at or before end + grace. Event 19:00 at 45 → 19:00, 19:45, 20:30, 21:15.
// Event 17:10 at 15 → 17:10, 17:25, 17:40…. 🔴 ONE RULE FOR EVERYONE: /api/slots (the customer's list), /api/dashboard
// (the operator's), the server's placement (lib/orders/place-in-slot.ts), the customer page's backup picker, the
// demo seeder (`firstGridTimeAtOrAfter`) and every per-event override all build from this function, so no two can
// disagree. A start on a multiple of the interval (17:00 at 15) gives exactly the clock-anchored list it gave before.
//
// Example: start=17:00, end=20:00, interval=5, slotDuration=15
//   17:00 → prod 17:00 | 17:05 → prod 17:00 | 17:10 → prod 17:00
//   17:15 → prod 17:15 | ... | 20:00 → prod 20:00
// Example: start=17:50, end=20:00, interval=15, slotDuration=10
//   17:50 → prod 17:50 | 18:05 → prod 18:00 | 18:20 → prod 18:20 | ...
//
// ⚠️ THE production_slot DERIVATION IS UNCHANGED (still floor to slot_duration_mins), and so is grace:
// pass graceAfterEndMins > 0 to extend beyond end_time (truck-only grace slots), measured in minutes.
// 🔴 THIS IS A SELECTION GRID ONLY. Nothing here is a cooking window; §31's engine does not read it.

export interface CollectionTimeRow {
  collection_time: string   // HH:MM
  production_slot: string   // HH:MM (batch window start)
}

const toMins = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const toStr = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/**
 * 🔴 THE FIRST GRID TIME AT OR AFTER `atOrAfterMins` on an event's grid (start, start + interval, …) — the one
 * rounding rule for "the earliest time a customer can be given". Before the start it is the start.
 */
export const firstGridTimeAtOrAfter = (startMins: number, atOrAfterMins: number, intervalMins: number): number => {
  const iv = Math.max(1, Math.floor(intervalMins))
  return atOrAfterMins <= startMins ? startMins : startMins + Math.ceil((atOrAfterMins - startMins) / iv) * iv
}

/**
 * The three example times Manage shows under each Collection-times select: "18:00, 18:15, 18:30…".
 *
 * 🔴 IT CALLS THE REAL GENERATOR. The point of the example is to promise the operator what they will
 * actually get, so deriving it from a second hard-coded list would let the promise and the grid drift —
 * and the example is the ONLY place most operators will ever see the rule stated. 18:00 is a fixed
 * illustration (an event starting at 18:00), not the truck's event, so the first entry is always 18:00.
 *
 * The window is 18:00-23:00 with no grace, which yields far more than three entries at every choice in
 * INTERVAL_CHOICES; only the first three are shown.
 */
export function intervalExample(intervalMins: number): string {
  const iv = intervalMins > 0 ? intervalMins : 5
  const first3 = generateCollectionTimes('18:00', '23:00', iv, iv, 0).slice(0, 3).map(t => t.collection_time)
  return `${first3.join(', ')}…`
}

export function generateCollectionTimes(
  startTime: string,
  endTime: string,
  intervalMins: number,
  slotDurationMins: number,
  graceAfterEndMins: number = 0
): CollectionTimeRow[] {
  const start = toMins(startTime)
  // 🔴 AN EVENT THAT RUNS PAST MIDNIGHT (end earlier than start, lib/event-window.ts): its end is the next day's, so the
  // walk continues past 23:59 and each time is written back on the clock ("00:15") — in order, after "23:55". Any other
  // event: exactly as before.
  const overnight = toMins(endTime) < start
  const end = overnight ? toMins(endTime) + 1440 : toMins(endTime)
  // ⚠️ ONLY an overnight event's times are written back on the clock (% 1440). A normal event whose end + grace passes
  // midnight keeps the "24:xx" grace labels it always produced — byte-identical (scripts/slot-interval-generator.cjs).
  const label = (m: number) => toStr(overnight ? m % 1440 : m)
  const result: CollectionTimeRow[] = []
  // 🔴 START ANCHORING (collection-anchor-1): the grid begins AT the event's start — see the header.
  const first = start

  for (let mins = first; mins <= end + graceAfterEndMins; mins += intervalMins) {
    const prodMins = Math.floor(mins / slotDurationMins) * slotDurationMins
    result.push({ collection_time: label(mins), production_slot: label(prodMins) })
  }

  return result
}
