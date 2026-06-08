// lib/slot-utils.ts
// SINGLE SOURCE OF TRUTH for slot/time availability logic
// Used by: customer order form, truck dashboard

import { localTodayIso } from '@/lib/time-utils'

export interface SlotBase {
  collection_time: string
  available: boolean
  is_grace?: boolean
}

export function getAsapSlot<T extends SlotBase>(slots: T[], eventDate?: string): T | null {
  const now = new Date()
  // LOCAL date (s.7) so it agrees with the LOCAL nowMins below — toISOString() (UTC) would
  // roll over at UTC midnight and treat a future event as today, flooring it by the clock.
  const todayStr = localTodayIso()
  const isToday = !eventDate || eventDate === todayStr

  if (!isToday) {
    return slots.find(s => s.available && !s.is_grace) || null
  }

  const nowMins = now.getHours() * 60 + now.getMinutes()
  return slots.find(s => {
    const [h, m] = s.collection_time.split(':').map(Number)
    return (h * 60 + m) > nowMins && s.available && !s.is_grace
  }) || null
}
