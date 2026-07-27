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
  const endMins = endH * 60 + endM
  while (mins <= endMins) {
    slots.push(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`)
    mins += intervalMins
  }
  return slots
}
