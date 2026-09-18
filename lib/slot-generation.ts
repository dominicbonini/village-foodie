// Generates collection time slots for an event based on truck config.
// Each slot gets a production_slot (batch window) by rounding down to the
// nearest slot_duration_mins boundary.
//
// ── 🔴 CLOCK-ANCHORED (16 September 2026, decision D1) ─────────────────────────────────────────────
// Selectable times are multiples of `intervalMins` measured from MIDNIGHT — at 15 that is :00/:15/:30/:45
// — NOT multiples counted from the event start. The first time is the first multiple at or after the
// start; the last is the last multiple at or before end + grace. A 17:50 start at 15 offers 18:00,
// 18:15…; no earlier collection is offered, and that is accepted.
// 🔴 AT INTERVAL 5 THIS IS BYTE-IDENTICAL TO THE OLD START-ANCHORED WALK, because every live event
// starts on a 5-minute mark (LIVE-verified: no Gusto event ever, and no event from today onwards for any
// truck, starts off one) — `ceil(start/5)*5 === start`, so the first time and every later one coincide.
// scripts/slot-interval-generator.cjs proves that for every start 00:00–23:55 against a frozen copy.
//
// Example: start=17:00, end=20:00, interval=5, slotDuration=15
//   17:00 → prod 17:00 | 17:05 → prod 17:00 | 17:10 → prod 17:00
//   17:15 → prod 17:15 | ... | 20:00 → prod 20:00
// Example: start=17:50, end=20:00, interval=15, slotDuration=10
//   18:00 → prod 18:00 | 18:15 → prod 18:10 | 18:30 → prod 18:30 | ... (never 17:50)
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
 * The first clock-anchored time at or after `startMins`. Exported so the customer page's fallback
 * picker and the harness derive their grids from THIS rule and not from a second one.
 */
export const firstClockSlotAtOrAfter = (startMins: number, intervalMins: number): number =>
  Math.ceil(startMins / intervalMins) * intervalMins

/**
 * 🔴 THE MINUTE LIST FOR A CLOCK-ANCHORED GRID — ['00','05',…] at 5, ['00','15','30','45'] at 15.
 * The customer page's fallback picker (hour select + minute select) MUST take its minutes from here.
 * It used to hold its own hardcoded twelve-entry list, which agreed with the server only because the
 * server was start-anchored AND every start was a 5-minute mark; at any other interval that list would
 * have offered times the server never generates — the V11.15 outage class. One rule, both sides.
 */
export function clockGridMinutes(intervalMins: number): string[] {
  const step = Math.max(1, Math.floor(intervalMins))
  const out: string[] = []
  for (let m = 0; m < 60; m += step) out.push(String(m).padStart(2, '0'))
  return out
}

/**
 * The three example times Manage shows under each Collection-times select: "18:00, 18:15, 18:30…".
 *
 * 🔴 IT CALLS THE REAL GENERATOR. The point of the example is to promise the operator what they will
 * actually get, so deriving it from a second hard-coded list would let the promise and the grid drift —
 * and the example is the ONLY place most operators will ever see the rule stated. 18:00 is a fixed
 * illustration, not the truck's event, so the list is clock-anchored from a whole hour at every
 * interval and the first entry is always 18:00.
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
  const end = toMins(endTime)
  const result: CollectionTimeRow[] = []
  // 🔴 CLOCK ANCHORING: begin at the first multiple of the interval at or after the start, not at the
  // start itself. At interval 5 and a 5-minute-mark start this IS the start — see the header.
  const first = firstClockSlotAtOrAfter(start, intervalMins)

  for (let mins = first; mins <= end + graceAfterEndMins; mins += intervalMins) {
    const prodMins = Math.floor(mins / slotDurationMins) * slotDurationMins
    result.push({ collection_time: toStr(mins), production_slot: toStr(prodMins) })
  }

  return result
}
