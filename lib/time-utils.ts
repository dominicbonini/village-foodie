// SINGLE SOURCE OF TRUTH for time display — always use this, never raw DB times
// DB stores HH:MM:SS — this strips seconds for all customer and operator surfaces
/** Strip seconds from HH:MM:SS → HH:MM. Safe on HH:MM too. */
export function formatTime(time: string): string {
  return time?.slice(0, 5) ?? ''
}

/**
 * "HH:MM – HH:MM" for display — the canonical event-time range. Always trims seconds (never raw).
 * Both empty → ''; no end → just the start; no start → just the end. Use this everywhere a
 * start–end pair is shown so no surface re-introduces seconds (the recurring bug).
 */
export function formatTimeRange(start?: string | null, end?: string | null): string {
  const s = formatTime(start ?? '')
  const e = formatTime(end ?? '')
  if (!s && !e) return ''
  if (!e) return s
  if (!s) return e
  return `${s} – ${e}`
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

/**
 * Status-INDEPENDENT default event pick (cross-event resolution fix). Given a list of
 * events, return the one to default to WITHOUT ever keying on status ('open'/'live') or a
 * UTC "today" lookup — so a stale-live event (auto-close failed) can NEVER hijack the
 * resolution of a different selected/viewed event. Order:
 *   1. the event currently in progress BY TIME (start <= now <= end), else
 *   2. the earliest upcoming event by start datetime, else
 *   3. the most recent past event by start datetime (so something sensible still shows).
 * Times are parsed as LOCAL wall-clock (`${event_date}T${time}`), matching localTodayIso().
 * Callers should always prefer an explicit event_id; this is only the no-selection default.
 */
export function pickDefaultEventByTime<
  T extends { event_date: string; start_time: string | null; end_time: string | null }
>(events: T[]): T | null {
  if (!events?.length) return null
  const now = Date.now()
  const startMs = (e: T) => e.start_time ? new Date(`${e.event_date}T${e.start_time}`).getTime() : Number.POSITIVE_INFINITY
  const endMs = (e: T) => e.end_time ? new Date(`${e.event_date}T${e.end_time}`).getTime() : Number.POSITIVE_INFINITY
  const current = events.find(e => startMs(e) <= now && now <= endMs(e))
  if (current) return current
  const upcoming = events.filter(e => startMs(e) >= now).sort((a, b) => startMs(a) - startMs(b))
  if (upcoming.length) return upcoming[0]
  return [...events].sort((a, b) => startMs(b) - startMs(a))[0] ?? null
}
