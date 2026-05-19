// Generates collection time slots from event start → end based on truck config.
// Each slot gets a production_slot (batch window) by rounding down to the
// nearest slot_duration_mins boundary.
//
// Example: start=17:00, end=20:00, interval=5, slotDuration=15
//   17:00 → prod 17:00 | 17:05 → prod 17:00 | 17:10 → prod 17:00
//   17:15 → prod 17:15 | ... | 20:00 → prod 20:00
//
// Pass graceAfterEndMins > 0 to extend beyond end_time (truck-only grace slots).

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

  for (let mins = start; mins <= end + graceAfterEndMins; mins += intervalMins) {
    const prodMins = Math.floor(mins / slotDurationMins) * slotDurationMins
    result.push({ collection_time: toStr(mins), production_slot: toStr(prodMins) })
  }

  return result
}
