// SINGLE SOURCE OF TRUTH for time display — always use this, never raw DB times
// DB stores HH:MM:SS — this strips seconds for all customer and operator surfaces
/** Strip seconds from HH:MM:SS → HH:MM. Safe on HH:MM too. */
export function formatTime(time: string): string {
  return time?.slice(0, 5) ?? ''
}

// LOCAL calendar date (yyyy-mm-dd). Section 7: never use toISOString() (UTC) to decide
// whether an event date is "today". toISOString() rolls over at UTC midnight, so in the
// evening it can already read the next day's date while wall-clock-derived nowMins
// (getHours) is still the day before — that mismatch wrongly treats a FUTURE event as
// today and floors its slots by the wall clock. Built from local Y/M/D so it always
// agrees with the local nowMins it is compared against.
export function localTodayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
