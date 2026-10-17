// lib/event-window.ts — 🔴 THE ONE RULE FOR AN EVENT THAT RUNS PAST MIDNIGHT (17 October 2026,
// docs/midnight-and-format-fixes-report.md). Client-safe, pure apart from the clock helpers it imports.
//
// An event is stored as `event_date` + `start_time` + `end_time` (wall-clock times in the truck's zone). An order's slot is
// a wall-clock "HH:MM". Until this file every surface read both as times ON `event_date`, so a 20:00–00:30 event "ended"
// at 00:30 on its own start date — before it began. The rule, stated once and used everywhere:
//   • An event CROSSES MIDNIGHT when its end is EARLIER than its start (end < start). Its end is on the next calendar day.
//   • On such an event, a clock time earlier than the start (a slot, a finish time) is on the next calendar day too.
//   • end == start is NOT overnight: it keeps today's behaviour (a zero-length event, refused by hasValidEventTimes) —
//     an ambiguous shape, recorded as a decision for Dominic rather than guessed at.
//   • An event whose end is after its start is untouched: every number below is exactly what the old arithmetic gave.
//
// 🔴 THE EVENT TIMELINE. Every decision compares two points on ONE axis: minutes after 00:00 on `event_date`, in the
// truck's zone. A time on an overnight event's next day is +1440; "now" is (days since event_date) × 1440 + the minute
// of day. So "is it over?" is `nowOnEvent(...) > eventEndMins(...)`, "is this slot past?" is
// `nowOnEvent(...) > eventTimeMins(...)`, and sorting slots is sorting `eventTimeMins` — the same comparisons the
// surfaces already made, on minutes that no longer wrap at midnight. For a normal event, today, the values are the
// plain minute-of-day the code used before (days since event_date is 0), so nothing that does not cross midnight moves.
import { getLocalDateInTz, getNowMinsInTz, addDaysYmd, instantOfLocal, clockMins, crossesMidnight } from '@/lib/time-utils'

// The two basic predicates live in lib/time-utils.ts (the module with no imports) so it can use them too; re-exported
// here, where every caller reads the rule.
export { clockMins, crossesMidnight }

/** A clock time on the event's timeline (minutes after 00:00 on event_date): +1440 when the event crosses midnight and
 *  the time is earlier than its start. Null for an unreadable time. */
export function eventTimeMins(start: string | null | undefined, end: string | null | undefined, time: string | null | undefined): number | null {
  const t = clockMins(time)
  if (t == null) return null
  const s = clockMins(start)
  return crossesMidnight(start, end) && s != null && t < s ? t + 1440 : t
}

/** The event's end on its timeline: the end's minute of day, +1440 when it crosses midnight. Null without an end. */
export function eventEndMins(start: string | null | undefined, end: string | null | undefined): number | null {
  return eventTimeMins(start, end, end)
}

/** "Now" on the event's timeline, in the truck's zone: (days from event_date to the truck's today) × 1440 + the minute of
 *  day. 0–1439 on the event's own date; 1440+ on the next day (an overnight event's small hours); negative before it. */
export function nowOnEvent(eventDate: string, tz: string): number {
  const today = getLocalDateInTz(tz)
  return daysBetween(eventDate, today) * 1440 + getNowMinsInTz(tz)
}

/** Whole calendar days from `a` to `b` ('YYYY-MM-DD'), zone-free. */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, (m2 || 1) - 1, d2 || 1) - Date.UTC(y1, (m1 || 1) - 1, d1 || 1)) / 86400000)
}

/** The calendar date a clock time on the event falls on: event_date, or the next day for a past-midnight time. */
export function eventTimeDate(eventDate: string, start: string | null | undefined, end: string | null | undefined, time: string | null | undefined): string {
  const m = eventTimeMins(start, end, time)
  return m != null && m >= 1440 ? addDaysYmd(eventDate, 1) : eventDate
}

/** The UTC instant (ms) of a clock time on the event, in the truck's zone (the next day's for a past-midnight time). */
export function eventTimeInstant(eventDate: string, start: string | null | undefined, end: string | null | undefined, time: string, tz: string): number {
  return instantOfLocal(eventTimeDate(eventDate, start, end, time), time, tz)
}

/** The event's end as a UTC instant (ms) — on the next day when it crosses midnight. Null without an end time. */
export function eventEndInstant(eventDate: string, start: string | null | undefined, end: string | null | undefined, tz: string): number | null {
  if (clockMins(end) == null) return null
  return eventTimeInstant(eventDate, start, end, end as string, tz)
}

/** The calendar dates an event touches: [event_date] or [event_date, next day] for an overnight event. For "today's
 *  events" filters — an overnight event that started yesterday is still today's event until it ends. */
export function eventDates(eventDate: string, start: string | null | undefined, end: string | null | undefined): string[] {
  return crossesMidnight(start, end) ? [eventDate, addDaysYmd(eventDate, 1)] : [eventDate]
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ENGINE CLOCK — how an overnight event's slots enter the capacity engine
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// The slot / capacity engine (lib/slot-availability.ts and its callers) parses slot strings as minute-of-day and sorts
// them as strings. Rather than thread an event through every one of its functions, an overnight event's past-midnight
// times are handed to it on an EXTENDED clock — "00:15" becomes "24:15" — so `parseMins`, string sorting and every
// comparison inside the engine order them after "23:55" with no change to the engine. What leaves the engine is turned
// back ("24:15" → "00:15") before it is stored or shown: STORAGE AND SCREENS ALWAYS HOLD THE CANONICAL "HH:MM".
// 🔴 For an event that does not cross midnight every function below is the identity — the engine sees exactly what it saw.

/** "00:15" → "24:15" when the event crosses midnight and the time is before its start; anything else unchanged. Also maps
 *  each side of a "HH:MM-HH:MM" window key. Seconds, if present, are kept. */
export function toEngineClock(time: string, start: string | null | undefined, end: string | null | undefined): string {
  if (!crossesMidnight(start, end) || typeof time !== 'string') return time
  if (time.includes('-')) return time.split('-').map(p => toEngineClock(p, start, end)).join('-')
  const s = clockMins(start) as number, t = clockMins(time)
  if (t == null || t >= s) return time
  const m = /^(\d{1,2})(:\d{2}(?::\d{2})?)/.exec(time.trim())
  return m ? `${String(Number(m[1]) + 24).padStart(2, '0')}${m[2]}` : time
}

/** "24:15" → "00:15" (hours of 24 and more wrap); a canonical time is returned unchanged. Also maps window keys. */
export function fromEngineClock(time: string): string {
  if (typeof time !== 'string') return time
  if (time.includes('-')) return time.split('-').map(fromEngineClock).join('-')
  const m = /^(\d{2,})(:\d{2}(?::\d{2})?)$/.exec(time.trim())
  if (!m || Number(m[1]) < 24) return time
  return `${String(Number(m[1]) % 24).padStart(2, '0')}${m[2]}`
}

/** One event's engine-clock mapper: `to`/`from` for single times, plus the shapes the engine takes (rows with a
 *  `collection_time`/`production_slot`, records keyed by slot). `overnight` false ⇒ every method returns its input as is. */
export function engineClock(start: string | null | undefined, end: string | null | undefined) {
  const overnight = crossesMidnight(start, end)
  const to = (t: string) => (overnight ? toEngineClock(t, start, end) : t)
  const from = (t: string) => (overnight ? fromEngineClock(t) : t)
  /** Map the named string fields of each row. */
  const rows = <T extends Record<string, unknown>>(list: T[], fields: (keyof T)[], f: (t: string) => string): T[] =>
    overnight ? list.map(r => { const o = { ...r }; for (const k of fields) if (typeof o[k] === 'string') (o as Record<keyof T, unknown>)[k] = f(o[k] as string); return o }) : list
  /** Map a record's keys. */
  const keys = <V>(rec: Record<string, V>, f: (t: string) => string): Record<string, V> =>
    overnight ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [f(k), v])) : rec
  return {
    overnight, to, from,
    rowsTo: <T extends Record<string, unknown>>(list: T[], fields: (keyof T)[]) => rows(list, fields, to),
    rowsFrom: <T extends Record<string, unknown>>(list: T[], fields: (keyof T)[]) => rows(list, fields, from),
    keysTo: <V>(rec: Record<string, V>) => keys(rec, to),
    keysFrom: <V>(rec: Record<string, V>) => keys(rec, from),
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// "UPCOMING" — an overnight event that started yesterday is still upcoming until it ends
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// Every `event_date >= today` query drops a running overnight event at midnight. The fix, in one shape: query from
// YESTERDAY (`upcomingQueryFloor`) and keep a row when `isUpcomingOrRunning`. For a normal event the kept set is exactly
// the old one (yesterday's normal events are dropped), so a caller that also applies a LIMIT must apply it AFTER this
// filter, never in the query.

/** The earliest event_date an "upcoming" query must read: yesterday, in the truck's zone. */
export function upcomingQueryFloor(tz: string): string {
  return addDaysYmd(getLocalDateInTz(tz), -1)
}

/** Dated today or later; or an overnight event from yesterday whose end is still ahead (or, with no clock passed,
 *  any overnight event from yesterday). `nowMins` is the truck's minute of day. */
export function isUpcomingOrRunning(e: { event_date: string | null; start_time?: string | null; end_time?: string | null }, today: string, nowMins?: number): boolean {
  if (!e.event_date) return false
  if (e.event_date >= today) return true
  if (e.event_date !== addDaysYmd(today, -1) || !crossesMidnight(e.start_time, e.end_time)) return false
  return nowMins == null || nowMins + 1440 <= (eventEndMins(e.start_time, e.end_time) as number)
}
