// lib/weekly-post/week.ts — which seven days is "this week", and when does the picker default to next?
//
// ── 🔴 THE RULE THIS FILE EXISTS TO MAKE IMPOSSIBLE TO GET WRONG ────────────────────────────────────
// A weekly post is Monday–Sunday in Europe/London. Get the boundary wrong by an hour and the post for
// "this week" starts on Sunday, which is wrong in a way an operator would only notice after posting.
//
// 🔴 EVERYTHING HERE WORKS ON CALENDAR DATES ('YYYY-MM-DD'), NEVER ON INSTANTS. A calendar date's
// weekday is a property of the date, not of a timezone or a clock — so once `localDateOfInstant` has
// answered "what is today's date in London", every other question (which Monday, plus six days, is
// this Friday) is pure string/integer arithmetic that **cannot** be affected by a DST change.
//
// ⚠️ THIS IS WHY THE BST→GMT WEEKEND IS NOT A SPECIAL CASE. On 25 October 2026 the clocks go back, and
// that Sunday is the last day of the week beginning Monday 19 October. Code that built a week by adding
// `6 * 24 * 60 * 60 * 1000` to a timestamp would land on Saturday 24th at 23:00 and produce a six-day
// week. Nothing here adds milliseconds. The harness asserts that week anyway, because "it cannot
// happen by construction" is a claim worth testing.
//
// ⚠️ THE ONE INSTANT→DATE CONVERSION GOES THROUGH `localDateOfInstant`, the repo's existing primitive,
// whose own comment forbids hand-rolling a parallel `Intl` call at the call site.

import { localDateOfInstant } from '@/lib/time-utils'

export const WEEK_TZ = 'Europe/London'

/** Monday-first, because the week is Monday–Sunday. ⚠️ NOT `Date.getDay()`'s Sunday-first numbering. */
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type WeekChoice = 'this' | 'next'

export interface WeekRange {
  which: WeekChoice
  /** 'YYYY-MM-DD' Monday. */
  start: string
  /** 'YYYY-MM-DD' Sunday. */
  end: string
  /** The seven dates, Monday first. Always exactly 7. */
  days: string[]
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A calendar date as a UTC-noon instant.
 *
 * 🔴 NOON, AND THAT IS THE WHOLE TRICK. Date arithmetic at UTC midnight can be pushed onto the
 * previous or next day by a timezone or a leap second; noon has twelve hours of slack either side, so
 * adding or subtracting whole days can never change the calendar date it lands on. Every date helper
 * below goes through here, so none of them can drift.
 */
function atUtcNoon(ymd: string): Date {
  const m = YMD.exec(ymd)
  if (!m) throw new Error(`week: not a YYYY-MM-DD date: ${JSON.stringify(ymd)}`)
  const y = Number(m[1]), mo = Number(m[2]), day = Number(m[3])
  const d = new Date(Date.UTC(y, mo - 1, day, 12, 0, 0))
  /* ⛔ THE ROUND TRIP IS THE CHECK, AND `Number.isNaN` ALONE WAS NOT ENOUGH. `Date.UTC(2026, 12, 99)`
   * does not produce an Invalid Date — it ROLLS OVER, silently, to 7 April 2027. So '2026-13-99' and
   * '2026-02-30' both passed a NaN test and came back as real dates in the wrong month, which for this
   * module means a poster for the wrong seven days with no error anywhere. Comparing the components
   * back out is what makes an impossible date impossible. */
  if (Number.isNaN(d.getTime())
    || d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) {
    throw new Error(`week: impossible date ${ymd}`)
  }
  return d
}

const toYmd = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(ymd: string): WeekdayIndex {
  // getUTCDay(): 0 = Sunday. Shift so Monday is 0.
  return ((atUtcNoon(ymd).getUTCDay() + 6) % 7) as WeekdayIndex
}

export function addDays(ymd: string, n: number): string {
  const d = atUtcNoon(ymd)
  d.setUTCDate(d.getUTCDate() + n)
  return toYmd(d)
}

/** The Monday of the week containing `ymd` — `ymd` itself when it is a Monday. */
export function mondayOf(ymd: string): string {
  return addDays(ymd, -weekdayOf(ymd))
}

/** Today's date in London. ⚠️ The only place this module reads a clock. */
export function todayInWeekTz(now: Date | string = new Date()): string {
  return localDateOfInstant(now, WEEK_TZ)
}

/**
 * Which week the picker opens on.
 *
 * 🔴 NEXT WEEK FROM FRIDAY 00:00 ONWARDS, otherwise this week — the brief's rule, and a sensible one:
 * by Friday the current week is effectively posted and what the operator wants is the week ahead.
 *
 * ⚠️ IT IS A DATE TEST, NOT A TIME TEST. "Friday 00:00 onwards" is the same statement as "the local
 * date is a Friday, Saturday or Sunday", because 00:00 is the start of the day. Reading an hour here
 * would add a clock dependency for no gain and would be wrong for the hour the clocks change.
 */
export function defaultWeekChoice(now: Date | string = new Date()): WeekChoice {
  return weekdayOf(todayInWeekTz(now)) >= 4 ? 'next' : 'this'
}

/**
 * The seven days of `which` week, relative to `now`.
 *
 * ⚠️ "THIS WEEK" IS THE WEEK CONTAINING TODAY, including on a Friday when the picker DEFAULTS to next.
 * The default and the meaning are deliberately separate: an operator who switches back to "This week"
 * on a Saturday wants the week they are in, not the one that is ending.
 */
export function weekRange(which: WeekChoice, now: Date | string = new Date()): WeekRange {
  const monday = which === 'next'
    ? addDays(mondayOf(todayInWeekTz(now)), 7)
    : mondayOf(todayInWeekTz(now))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  return { which, start: monday, end: days[6], days }
}

/** Both weeks the picker offers, in order, so the UI has no arithmetic of its own. */
export function weekOptions(now: Date | string = new Date()): WeekRange[] {
  return [weekRange('this', now), weekRange('next', now)]
}
