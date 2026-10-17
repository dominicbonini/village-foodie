// lib/slot-utils.ts
// SINGLE SOURCE OF TRUTH for slot/time availability logic
// Used by: customer order form, truck dashboard

import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'
// 17 October 2026: an event that runs past midnight (lib/event-window.ts) — its after-midnight slots are the NEXT day's.
import { crossesMidnight, eventTimeMins, nowOnEvent } from '@/lib/event-window'

/** The event's own times, so a slot can be placed on the right day. Omitted ⇒ the slot is on eventDate (as before). */
export type SlotEventTimes = { start_time?: string | null; end_time?: string | null } | null | undefined

export interface SlotBase {
  collection_time: string
  available: boolean
  is_grace?: boolean
}

// `tz` is the TRUCK's zone (lib/truck-time.ts; TimeSettings.timeZone in a browser) — required, no default.
// "now"/"today" run in it, so neither the device's nor the server's zone can shift the result.
export function getAsapSlot<T extends SlotBase>(slots: T[], eventDate: string | undefined, tz: string, event?: SlotEventTimes): T | null {
  // The earliest slot that is (a) not genuinely past — live, event tz, via the SAME isSlotPast the
  // picker uses (handles future/prior day too) — AND (b) server-available. After V7.1, `available`
  // folds the SINGLE prep-based readiness floor (earliestCollectionMins) + capacity, with NO flat +5
  // lead. So this returns EXACTLY the earliest slot the picker allows → ASAP == earliest selectable
  // == pickable (the V6.9 invariant), on every surface that derives ASAP from this one helper.
  return slots.find(s => !isSlotPast(s, tz, eventDate, event) && s.available && !s.is_grace) || null
}

// SINGLE SOURCE OF TRUTH for "is this slot in the past" — used by BOTH the customer page and the
// dashboard, ALWAYS computed LIVE from the current time in the event's timezone, NEVER from the
// cached server is_past flag (which is snapshotted at fetch and goes stale as the clock advances).
// INVARIANT: no slot where slotMins < getNowMinsInTz(eventTz) on the event's date may be displayed
// or selectable on ANY surface. eventDate guards future/prior days (a future event's morning slots
// are NOT "past"); omit it to treat the slot as today's.
// 🔴 AN EVENT THAT RUNS PAST MIDNIGHT (pass `event`): its slot and "now" are both read on the event's timeline
// (lib/event-window.ts), so 00:15 on a 20:00–00:30 event is ahead of 23:50 and behind 00:20 the next day. Any other event
// — or no `event` — takes the original branch below, unchanged.
export function isSlotPast(slot: { collection_time: string }, tz: string, eventDate?: string, event?: SlotEventTimes): boolean {
  if (eventDate && event && crossesMidnight(event.start_time, event.end_time)) {
    return (eventTimeMins(event.start_time, event.end_time, slot.collection_time) as number) < nowOnEvent(eventDate, tz)
  }
  if (eventDate) {
    const today = getLocalDateInTz(tz)
    if (eventDate > today) return false  // future day — never past
    if (eventDate < today) return true   // prior day — all past
  }
  const [h, m] = slot.collection_time.split(':').map(Number)
  return (h * 60 + m) < getNowMinsInTz(tz)
}
