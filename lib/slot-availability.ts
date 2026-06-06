// lib/slot-availability.ts
// Shared slot availability calculation (customer slots API + dashboard).

export interface CollectionTimeRow {
  collection_time: string
  production_slot: string
}

export interface SlotAvailabilityRow {
  collection_time: string
  production_slot: string
  /** Oven batches in use for this production window (not customer count). */
  current_orders: number
  /** Max oven batches for this production window (from slot_capacity.max_orders). */
  max_orders: number
  soft_max: number
  remaining: number
  available: boolean
  is_past: boolean
  /** True for slots after the event end time (grace period for truck only). */
  is_grace: boolean
}

const SOFT_CAP_RATIO = 0.85

export function buildSlotAvailability(params: {
  times: CollectionTimeRow[]
  capacityMap: Record<string, number>
  slotCounts: Record<string, number>
  date: string
  nowMins: number
  earliestCollectionMins: number
  /** If set, slots after this minute are flagged is_grace (truck grace period). */
  eventEndMins?: number
}): SlotAvailabilityRow[] {
  const { times, capacityMap, slotCounts, date, nowMins, earliestCollectionMins, eventEndMins } = params
  const today = new Date().toISOString().split('T')[0]

  return times.map(s => {
    const maxOrders = capacityMap[s.production_slot] || 999
    const currentOrders = slotCounts[s.collection_time] || 0
    const softMax = Math.max(1, Math.floor(maxOrders * SOFT_CAP_RATIO))
    const capacityAvailable = currentOrders < softMax
    const remaining = Math.max(0, softMax - currentOrders)

    const [h, m] = s.collection_time.split(':').map(Number)
    const slotMins = h * 60 + m
    const isGrace = eventEndMins !== undefined && slotMins > eventEndMins
    // Grace slots are never considered "past" — truck should always be able to assign them
    const isPast = !isGrace && date === today && slotMins <= nowMins + 5
    // No date gate: for future dates the caller passes an event-start-anchored
    // floor (eventStart + queue push) — must apply or the future-event queue is
    // invisible. For today, callers fold nowMins into the floor themselves.
    const tooSoon = slotMins < earliestCollectionMins

    return {
      collection_time: s.collection_time,
      production_slot: s.production_slot,
      current_orders: currentOrders,
      max_orders: maxOrders,
      soft_max: softMax,
      remaining,
      available: capacityAvailable && !isPast && !tooSoon,
      is_past: isPast || tooSoon,
      is_grace: isGrace,
    }
  })
}
