// lib/slot-utils.ts
// SINGLE SOURCE OF TRUTH for slot/time availability logic
// Used by: customer order form, truck dashboard

import { getNowMinsInTz, getLocalDateInTz } from '@/lib/time-utils'

export interface SlotBase {
  collection_time: string
  available: boolean
  is_grace?: boolean
}

// tz defaults to 'Europe/London' (current default; replaced by trucks.timezone later). "now"/"today"
// run in the EVENT's timezone, so device/server tz can't shift the result.
export function getAsapSlot<T extends SlotBase>(slots: T[], eventDate?: string, tz: string = 'Europe/London'): T | null {
  // The earliest slot that is (a) not genuinely past — live, event tz, via the SAME isSlotPast the
  // picker uses (handles future/prior day too) — AND (b) server-available. After V7.1, `available`
  // folds the SINGLE prep-based readiness floor (earliestCollectionMins) + capacity, with NO flat +5
  // lead. So this returns EXACTLY the earliest slot the picker allows → ASAP == earliest selectable
  // == pickable (the V6.9 invariant), on every surface that derives ASAP from this one helper.
  return slots.find(s => !isSlotPast(s, tz, eventDate) && s.available && !s.is_grace) || null
}

// SINGLE SOURCE OF TRUTH for "is this slot in the past" — used by BOTH the customer page and the
// dashboard, ALWAYS computed LIVE from the current time in the event's timezone, NEVER from the
// cached server is_past flag (which is snapshotted at fetch and goes stale as the clock advances).
// INVARIANT: no slot where slotMins < getNowMinsInTz(eventTz) on the event's date may be displayed
// or selectable on ANY surface. eventDate guards future/prior days (a future event's morning slots
// are NOT "past"); omit it to treat the slot as today's.
export function isSlotPast(slot: { collection_time: string }, tz: string = 'Europe/London', eventDate?: string): boolean {
  if (eventDate) {
    const today = getLocalDateInTz(tz)
    if (eventDate > today) return false  // future day — never past
    if (eventDate < today) return true   // prior day — all past
  }
  const [h, m] = slot.collection_time.split(':').map(Number)
  return (h * 60 + m) < getNowMinsInTz(tz)
}
