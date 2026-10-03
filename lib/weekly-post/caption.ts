// lib/weekly-post/caption.ts — the words that go beside the picture.
//
// Two different things, and they are deliberately not the same text:
//   • THE WEEK CAPTION — one post for the whole image, listing the week.
//   • THE PER-EVENT POST — one short message per day, with the ordering link, worded relative to WHEN
//     THE OPERATOR COPIES IT ("tonight", "tomorrow", "on Tue 13 Oct").
//
// 🔴 THE PER-EVENT WORDING IS COMPUTED AT COPY TIME, NOT AT RENDER TIME. An operator opens this screen
// on Sunday to plan the week and comes back on Wednesday to post Wednesday's. If "tonight" had been
// baked in on Sunday it would now be a lie. Every function here takes `now` so the caller passes the
// moment of the copy — and so the harness can drive every relative case without a clock.
//
// ⚠️ PURE. No clock of its own, no database, no network.

import { localDateOfInstant } from '@/lib/time-utils'
import { formatOneTime, ordinal, type TimeStyle } from './format'
import { WEEKDAY_NAMES, WEEK_TZ, weekdayOf } from './week'
import type { WeekData, DayEntry } from './week-data'

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** "Tue 13 Oct". */
export function shortDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  return `${SHORT_DAYS[weekdayOf(ymd)]} ${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1]}`
}

/** The hour an event counts as an evening one. ⚠️ The brief's rule: start at or after 17:00. */
export const EVENING_FROM_HOUR = 17

const startHour = (t: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim())
  return m ? Number(m[1]) : null
}

export type WhenWord = 'today' | 'tonight' | 'tomorrow' | 'dated'

/**
 * How to refer to a date, relative to now.
 *
 * 🔴 "TONIGHT" BEATS "TODAY" WHEN THE EVENT STARTS AT 17:00 OR LATER — that is the brief's rule and it
 * is what a truck actually writes. "Tomorrow" has no evening form on purpose: "tomorrow night" is a
 * different promise from "tomorrow", and the operator can say it themselves if they mean it.
 * ⚠️ COMPARED AS CALENDAR DATES IN LONDON, never as timestamps. An event "today" is one whose date is
 * today's date where the truck is — not one within 24 hours.
 */
export function whenWord(eventDate: string, startTime: string | null | undefined, now: Date | string): WhenWord {
  const today = localDateOfInstant(now, WEEK_TZ)
  if (eventDate === today) {
    const h = startHour(startTime)
    return h !== null && h >= EVENING_FROM_HOUR ? 'tonight' : 'today'
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today)
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
    d.setUTCDate(d.getUTCDate() + 1)
    const tomorrow = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    if (eventDate === tomorrow) return 'tomorrow'
  }
  return 'dated'
}

/** The phrase itself: "today", "tonight", "tomorrow", "on Tue 13 Oct". */
export function whenPhrase(eventDate: string, startTime: string | null | undefined, now: Date | string): string {
  const w = whenWord(eventDate, startTime, now)
  return w === 'dated' ? `on ${shortDate(eventDate)}` : w
}

export interface EventPostInput {
  truckName: string
  entry: DayEntry
  date: string
  /** The truck's public ordering address. ⚠️ Built by `scanUrl` in lib/custom-domain/copy.ts — this
   *  module is handed the result rather than composing an address of its own. */
  orderUrl: string | null
  timeStyle: TimeStyle
  now: Date | string
}

/**
 * One event's ready-to-post text.
 *
 * 🔴 A CANCELLED EVENT GETS AN APOLOGY, NOT A SALES PITCH, and no ordering link — sending customers to
 * order from an event that is not happening is the one thing this text must never do.
 */
export function eventPostText(input: EventPostInput): string {
  const { entry, date, truckName, orderUrl, timeStyle, now } = input
  const where = entry.town && !entry.name.includes(entry.town) ? `${entry.name}, ${entry.town}` : entry.name
  const when = whenPhrase(date, entry.startTime, now)

  if (entry.status === 'cancelled') {
    return [
      `Sorry — we're not able to make ${where} ${when}.`,
      `Apologies to everyone who was planning to come. We'll be back soon.`,
    ].join('\n')
  }

  const from = entry.startTime ? formatOneTime(entry.startTime, timeStyle) : ''
  const to = entry.endTime ? formatOneTime(entry.endTime, timeStyle) : ''
  const times = from && to ? `${from} – ${to}` : from || to
  const lines = [
    `${truckName} at ${where} ${when}${times ? `, ${times}` : ''}.`,
  ]
  /* ⚠️ THE LINK IS ITS OWN LINE. Facebook and Instagram both linkify a bare URL on its own line and
   * both mangle one that trails a sentence with a full stop stuck to it. */
  if (orderUrl) {
    lines.push('')
    lines.push(`Order ahead: ${orderUrl}`)
  }
  return lines.join('\n')
}

export interface WeekCaptionInput {
  truckName: string
  week: WeekData
  orderUrl: string | null
  timeStyle: TimeStyle
  /** The operator's note for the week, if any. */
  note?: string | null
}

/**
 * The caption for the image.
 *
 * 🔴 IT LISTS ONLY THE DAYS THE TRUCK IS OUT. Seven lines, four of them "no trading today", is not a
 * caption anyone posts — the days off are information the IMAGE carries, where they fill the grid the
 * truck designed. The caption is the summary.
 * ⚠️ THE OPERATOR CAN EDIT IT. This is a starting point, which is why it is plain text with no markup
 * and no emoji they would have to delete.
 */
export function weekCaption(input: WeekCaptionInput): string {
  const { truckName, week, orderUrl, timeStyle, note } = input
  const lines: string[] = []
  lines.push(`${truckName} — where we are this week:`)
  lines.push('')
  for (const day of week.days) {
    if (day.isDayOff) continue
    const name = WEEKDAY_NAMES[weekdayOf(day.date)]
    for (const e of day.entries) {
      const where = e.town && !e.name.includes(e.town) ? `${e.name}, ${e.town}` : e.name
      if (e.status === 'cancelled') {
        lines.push(`${name} — ${where} — CANCELLED, sorry`)
        continue
      }
      const from = e.startTime ? formatOneTime(e.startTime, timeStyle) : ''
      const to = e.endTime ? formatOneTime(e.endTime, timeStyle) : ''
      const times = from && to ? `${from} – ${to}` : from || to
      lines.push(`${name} — ${where}${times ? ` — ${times}` : ''}`)
    }
  }
  /* ⚠️ A WEEK WITH NO EVENTS STILL PRODUCES A CAPTION, because the operator may be posting exactly
   * that. An empty string here would look like the feature failed. */
  if (lines.length === 2) lines.push('No dates this week — check back soon.')
  const trimmedNote = String(note ?? '').trim()
  if (trimmedNote) { lines.push(''); lines.push(trimmedNote) }
  if (orderUrl) { lines.push(''); lines.push(`Order ahead: ${orderUrl}`) }
  return lines.join('\n')
}

/** "Week commencing Monday 28th September" — the heading used in the screen's own copy. */
export function weekLabel(startYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startYmd)
  if (!m) return startYmd
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${WEEKDAY_NAMES[weekdayOf(startYmd)]} ${ordinal(Number(m[3]))} ${MONTHS[Number(m[2]) - 1]}`
}
