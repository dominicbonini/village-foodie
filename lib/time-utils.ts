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

// TIMEZONE ARCHITECTURE (V7.x) — the event's wall clock, not the device's or the server's (UTC on
// Vercel). All "now"/"today" decisions for slots run in the EVENT's timezone so server and every
// client agree. tz defaults to 'Europe/London' (the trial default); when trucks.timezone exists it
// replaces the default at the call sites — the plumbing is already here.

/** Current minute-of-day (hour*60+min) in the given timezone, regardless of device/server tz. */
export function getNowMinsInTz(tz: string = 'Europe/London'): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  return get('hour') * 60 + get('minute')
}

/** Both event times present + valid HH:MM — the precondition for an event going LIVE (confirmed/open). The
 *  slot/collection/capacity engine needs BOTH (start = floor, end = the slot-range/"available until" bound);
 *  a null time can't project slots. DRAFTS (unconfirmed) may omit them — this gates only the live transition. */
export function hasValidEventTimes(start?: string | null, end?: string | null): boolean {
  const ok = (t?: string | null) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d/.test(t)
  return ok(start) && ok(end)
}

/** Calendar date 'YYYY-MM-DD' in the given timezone (the tz-aware localToday). */
export function getLocalDateInTz(tz: string = 'Europe/London'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Calendar date 'YYYY-MM-DD' of an ARBITRARY instant (Date or ISO string) in the given timezone.
 *  Same tz-aware Intl pattern as getLocalDateInTz — just formatting a passed-in instant instead of
 *  now — so the two produce directly comparable strings (e.g. a log row's created_at vs today's
 *  local date). The shared primitive: never hand-roll a parallel Intl call / UTC-offset math at the
 *  call site (Section 7 UTC-vs-local discipline). */
export function localDateOfInstant(instant: Date | string, tz: string = 'Europe/London'): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

// LOCAL calendar date (yyyy-mm-dd). Section 7: never use toISOString() (UTC) to decide whether an
// event date is "today". Now a thin BACKWARD-COMPAT wrapper over getLocalDateInTz('Europe/London')
// — existing callers keep working; new tz-aware code calls getLocalDateInTz(eventTz) directly.
export function localTodayIso(): string {
  return getLocalDateInTz('Europe/London')
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
