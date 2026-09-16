// lib/whatsapp/usage.ts
// 🔴 HOW MANY MESSAGES WE HAVE SENT FOR A TRUCK THIS MONTH. ONE function, used by BOTH the webhook's
// enforcement and the Settings usage line — so the number the operator reads and the number that stops
// their replies can never be two different numbers.
//
// ── THE MONTH BOUNDARY, AND WHY IT IS NOT UTC ───────────────────────────────────────────────────────
// A calendar month in the TRUCK's timezone. On the day boundary a wrong timezone shifts a cap by an
// hour; on the MONTH boundary it shifts a whole billing period — silently, and in the direction of a
// ceiling that resets early, i.e. one that quietly stops being a ceiling.
// 🧪 2026-09-30T23:30:00Z is already 1 October in Europe/London (BST, UTC+1), so a UTC month start would
// count that message against September and let the truck spend twice in one Meta month.
// ⚠️ `trucks.timezone` IS NULL ON EVERY TRUCK TODAY, so 'Europe/London' is the branch that actually runs.
// It is a real fallback, not a pretend one — the column exists and the day it is populated this works.

import { localDateOfInstant } from '@/lib/time-utils'

export const DEFAULT_TRUCK_TZ = 'Europe/London'

/** The truck's timezone, or the documented default. Blank strings count as absent. */
export const truckTimezone = (tz: string | null | undefined): string =>
  tz && tz.trim() ? tz.trim() : DEFAULT_TRUCK_TZ

/**
 * PURE. The instant the truck's current calendar month began, as an ISO string.
 *
 * 🔴 BINARY SEARCH, NOT ARITHMETIC. "Midnight local on the 1st" is not a fixed UTC offset from the 1st:
 * it moves with daylight saving, and the UK changes clocks inside the window this is used over. The
 * search asks `localDateOfInstant` — the SAME primitive the greeting uses — which instant is the first
 * whose local date is the 1st. One helper, one answer, no second timezone implementation.
 */
export function monthStartIso(tz: string, now: Date = new Date()): string {
  const localToday = localDateOfInstant(now, tz)          // YYYY-MM-DD in the truck's zone
  const monthFirstLocal = `${localToday.slice(0, 7)}-01`
  let lo = Date.parse(`${monthFirstLocal}T00:00:00Z`) - 18 * 3600_000
  let hi = Date.parse(`${monthFirstLocal}T00:00:00Z`) + 18 * 3600_000
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (localDateOfInstant(new Date(mid), tz) < monthFirstLocal) lo = mid
    else hi = mid
  }
  return new Date(hi).toISOString()
}

/**
 * PURE. The local date the current month's allowance resets — the 1st of the NEXT month.
 * ⚠️ Returned as `YYYY-MM-DD` rather than formatted, so the copy decides how to say it.
 */
export function monthResetLocalDate(tz: string, now: Date = new Date()): string {
  const [y, m] = localDateOfInstant(now, tz).split('-').map(Number)
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  return `${nextY}-${String(nextM).padStart(2, '0')}-01`
}

/** The one query this needs, injected — so counting can be proved without a database. */
export interface UsageCounter {
  /** Rows for this truck since `sinceIso` that represent a message WE SENT. */
  (truckId: string, sinceIso: string): Promise<number>
}

export interface MonthlyUsage {
  used: number
  limit: number
  /** ISO instant the month began, for the query that produced `used`. */
  monthStartIso: string
  /** `YYYY-MM-DD` the allowance resets. */
  resetsOn: string
  /** True when the truck has reached or passed its ceiling and is silent for the rest of the month. */
  atLimit: boolean
}

/**
 * Read one truck's usage for the current month.
 *
 * 🔴 WHAT COUNTS: every message HatchGrab sent for this truck, HANDOFFS INCLUDED. The handoff used to be
 * excluded from the month count while being billed by Meta — the operator paid for a message their
 * ceiling could not see. The caller's `count` MUST therefore not filter cap classifications out.
 * ⚠️ `>= limit` — inclusive. At the limit the truck is silent; it does not wait for one over.
 */
export async function readMonthlyUsage(input: {
  truckId: string
  timezone: string | null | undefined
  limit: number
  count: UsageCounter
  now?: Date
}): Promise<MonthlyUsage> {
  const tz = truckTimezone(input.timezone)
  const now = input.now ?? new Date()
  const start = monthStartIso(tz, now)
  const used = await input.count(input.truckId, start)
  return {
    used,
    limit: input.limit,
    monthStartIso: start,
    resetsOn: monthResetLocalDate(tz, now),
    atLimit: used >= input.limit,
  }
}
