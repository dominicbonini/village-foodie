// lib/partner-send-schedule.ts — partners-2 (16 November 2026, docs/partners-2-report.md): WHEN AN OUTREACH EMAIL MAY GO.
// Pure: no database, no clock of its own (`now` is passed), no randomness of its own (`rand` is passed) — so the harness
// tests it with a dry-run clock across time zones and DST, and nothing is ever sent by testing it.
//
//   • The recipient's OWN time zone: Tuesday–Thursday, 09:30–11:30 local (both edges configurable as data), never at a
//     weekend. Public holidays are NOT applied: the repo has no holiday source (the report says so).
//   • ONE daily cap for the whole outreach system (truck prospects and partners together; default 25), counted over the
//     sender's day (Europe/London): what already went today counts against it.
//   • Sends are spaced RANDOMLY 3–8 minutes apart, across every recipient, so they never leave as a burst.
//   • A step falls due on its due date (the sequence's gap after the last send); the first window on or after that date —
//     in the recipient's calendar — is when it is planned. A send that does not fit today's window or today's cap moves to
//     the recipient's next window.
import { instantOfLocal, localDateOfInstant } from '@/lib/time-utils'

export interface SendWindow { days: number[]; start: string; end: string }   // days: 0 = Sunday … 6 = Saturday; "HH:MM"
export const DEFAULT_WINDOW: SendWindow = { days: [2, 3, 4], start: '09:30', end: '11:30' }
export const DEFAULT_DAILY_CAP = 25
export const SENDER_ZONE = 'Europe/London'
export const SPACING_MIN = { min: 3, max: 8 }

const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The first local date ≥ `fromYmd` that is a window day. */
export function nextWindowDay(fromYmd: string, w: SendWindow = DEFAULT_WINDOW): string {
  let d = fromYmd
  for (let i = 0; i < 8; i++, d = addDays(d, 1)) if (w.days.includes(weekdayOf(d))) return d
  throw new Error('[send-schedule] the window has no days')
}

/** The window of local day `ymd` in `tz`, as UTC instants (DST-correct: each edge is resolved on its own day). */
export function windowOn(ymd: string, tz: string, w: SendWindow = DEFAULT_WINDOW): { start: number; end: number } {
  return { start: instantOfLocal(ymd, `${w.start}:00`, tz), end: instantOfLocal(ymd, `${w.end}:00`, tz) }
}

/** The next window that has not ended yet at `now`, starting no earlier than local date `dueYmd`. */
export function nextWindow(now: Date, tz: string, dueYmd: string, w: SendWindow = DEFAULT_WINDOW): { day: string; start: number; end: number } {
  const today = localDateOfInstant(now, tz)
  let d = nextWindowDay(dueYmd > today ? dueYmd : today, w)
  for (let i = 0; i < 4; i++) {
    const win = windowOn(d, tz, w)
    if (win.end > now.getTime()) return { day: d, ...win }
    d = nextWindowDay(addDays(d, 1), w)
  }
  throw new Error('[send-schedule] no window found')
}

export interface DueSend { id: string; tz: string; dueYmd: string }
export interface PlannedSend { id: string; at: string; localDay: string; tz: string }

/**
 * Today's plan (the sender's day, Europe/London, of `now`): every due send whose recipient's next window STARTS within
 * today, in window order, spaced randomly 3–8 minutes apart, never past its window's end, and no more than the cap less
 * what already went today. Returns what is planned and what moves to a later window.
 */
export function planToday(due: DueSend[], opts: {
  now: Date; sentToday: number; cap?: number; window?: SendWindow; rand?: () => number; lastSentAt?: number | null
}): { planned: PlannedSend[]; later: { id: string; reason: 'cap' | 'window_full' | 'not_today'; nextDay: string }[] } {
  const cap = opts.cap ?? DEFAULT_DAILY_CAP
  const w = opts.window ?? DEFAULT_WINDOW
  const rand = opts.rand ?? Math.random
  const senderToday = localDateOfInstant(opts.now, SENDER_ZONE)
  const dayStart = instantOfLocal(senderToday, '00:00:00', SENDER_ZONE), dayEnd = instantOfLocal(addDays(senderToday, 1), '00:00:00', SENDER_ZONE)
  const withWin = due.map(d => ({ d, win: nextWindow(opts.now, d.tz, d.dueYmd, w) }))
    .sort((a, b) => a.win.start - b.win.start || a.d.id.localeCompare(b.d.id))
  const planned: PlannedSend[] = []
  const later: { id: string; reason: 'cap' | 'window_full' | 'not_today'; nextDay: string }[] = []
  let last = opts.lastSentAt ?? null
  let left = Math.max(0, cap - opts.sentToday)
  for (const { d, win } of withWin) {
    if (win.start >= dayEnd || win.end <= dayStart) { later.push({ id: d.id, reason: 'not_today', nextDay: win.day }); continue }
    if (left <= 0) { later.push({ id: d.id, reason: 'cap', nextDay: nextWindowDay(addDays(win.day, 1), w) }); continue }
    const gap = Math.round((SPACING_MIN.min + rand() * (SPACING_MIN.max - SPACING_MIN.min)) * 60_000)
    const earliest = Math.max(win.start, opts.now.getTime(), last === null ? 0 : last + gap)
    if (earliest > win.end) { later.push({ id: d.id, reason: 'window_full', nextDay: nextWindowDay(addDays(win.day, 1), w) }); continue }
    planned.push({ id: d.id, at: new Date(earliest).toISOString(), localDay: win.day, tz: d.tz })
    last = earliest
    left--
  }
  return { planned, later }
}

/** A step's due date: `gapDays` after the last send, in the recipient's calendar (the first contact is due at once). */
export function dueDate(lastSentAt: string | null, gapDays: number, tz: string, now: Date): string {
  if (!lastSentAt) return localDateOfInstant(now, tz)
  return addDays(localDateOfInstant(new Date(lastSentAt), tz), gapDays)
}
