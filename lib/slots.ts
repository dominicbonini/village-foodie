// lib/slots.ts
// Slot-grid helpers shared by every writer of slot_capacity.
//
// EXTRACTED (V9.x) from app/api/manage/route.ts, where generateSlots was a module-local, unexported
// function with two call sites (save_slot_capacity + upsert_event). The demo provisioner needs the SAME
// grid, and duplicating slot generation is exactly the drift the reference manual warns about — a second
// copy that quietly disagrees about, say, whether the end time is inclusive would put the demo's capacity
// model out of step with the operator's. Pure, zero dependencies, no I/O, no Date, no timezone.

/**
 * Every collection slot from `start` to `end` at `intervalMins`, as 'HH:MM'.
 *
 * ⚠️ INCLUSIVE OF `end` (`mins <= endMins`) — 17:00→20:00 at 5 yields 37 slots, not 36. Preserved exactly
 * as the original behaved; the whole slot_capacity grid is keyed off it.
 */
export function generateSlots(start: string, end: string, intervalMins: number): string[] {
  const slots: string[] = []
  const [startH, startM] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)
  let mins = startH * 60 + startM
  // 🔴 AN EVENT THAT RUNS PAST MIDNIGHT (end earlier than start, lib/event-window.ts): its end is the next day's, so the
  // walk continues past 23:59 and each slot is written canonically ("00:15"), in order after "23:55" — the rule
  // generateCollectionTimes follows. Any other event: exactly as before.
  const endMins = endH * 60 + endM < mins ? endH * 60 + endM + 1440 : endH * 60 + endM
  while (mins <= endMins) {
    const m = mins % 1440
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    mins += intervalMins
  }
  return slots
}
