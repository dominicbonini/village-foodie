// lib/slot-utils.ts
// SINGLE SOURCE OF TRUTH for slot/time availability logic
// Used by: customer order form, truck dashboard

export interface SlotBase {
  collection_time: string
  available: boolean
  is_grace?: boolean
}

export function getAsapSlot<T extends SlotBase>(slots: T[], eventDate?: string): T | null {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
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
