// lib/slot-utils.ts
// SINGLE SOURCE OF TRUTH for slot/time availability logic
// Used by: customer order form, truck dashboard

export interface SlotBase {
  collection_time: string
  available: boolean
  is_grace?: boolean
}

export function getAsapSlot<T extends SlotBase>(slots: T[]): T | null {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  return slots.find(s => {
    const [h, m] = s.collection_time.split(':').map(Number)
    return (h * 60 + m) > nowMins && s.available && !s.is_grace
  }) || null
}
