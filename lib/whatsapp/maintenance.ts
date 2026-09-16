// lib/whatsapp/maintenance.ts
// PURE decisions for the daily WhatsApp maintenance job, and the two period-key helpers that decide how
// often an alert may repeat. No I/O, no clock, no environment — `now` is always an argument.
//
// 🔴 THE JOB'S JUDGEMENT LIVES HERE, NOT IN THE ROUTE. The route is plumbing: read rows, call Meta,
// write rows. Everything that decides WHETHER to refresh, whether a token is beyond saving, and how
// loudly to complain is in this file so it can be proved against fixtures instead of against Meta.

import { localDateOfInstant } from '@/lib/time-utils'
import type { TokenInspection } from '@/lib/whatsapp/meta-admin'
import type { WhatsAppAlertKind } from '@/lib/whatsapp/alerts'

/**
 * Refresh once the token has less than this much life left.
 * ⚠️ TOKENS LAST 60 DAYS, so 30 gives the daily job THIRTY CONSECUTIVE CHANCES to succeed before the
 * connection dies. That margin is the point: a refresh that fails is normal (Meta rate-limits, networks
 * drop), and a threshold tight enough to be "efficient" would turn one bad week into a dead connection.
 */
export const REFRESH_WHEN_DAYS_LEFT_BELOW = 30

/** Below this, a failing refresh stops being informational and gets URGENT in the subject line. */
export const URGENT_WHEN_DAYS_LEFT_BELOW = 7

/** PURE. Whole days from `now` until `expiresAt`. Null when there is no expiry recorded. */
export function daysUntil(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null
  const t = Date.parse(expiresAt)
  if (Number.isNaN(t)) return null
  return Math.floor((t - now.getTime()) / 86_400_000)
}

/** The period key for the three token alerts: the UTC day, so a second run today sends nothing. */
export const utcDayKey = (now: Date): string => now.toISOString().slice(0, 10)

/**
 * The period key for the three allowance alerts: the truck's local month.
 * 🔴 IT MUST MATCH THE WINDOW THE ALLOWANCE ITSELF RESETS ON (lib/whatsapp/usage.ts), or an operator
 * gets their "80% used" email for a month that already ended, or never gets it for the one that started.
 */
export const usageMonthKey = (tz: string, now: Date): string => localDateOfInstant(now, tz).slice(0, 7)

export interface TokenPlan {
  /** Ask Meta to exchange this token for a fresh one. */
  refresh: boolean
  /** Write `token_revoked_at` — Meta has told us this credential is finished. */
  markRevoked: boolean
  /** The admin alert to raise from the INSPECTION alone. Refresh failures are classified separately. */
  alert: WhatsAppAlertKind | null
}

/**
 * PURE. What to do about one connection's token, given what Meta said about it.
 *
 * 🔴 AN INSPECTION WE COULD NOT PERFORM IS NOT AN INVALID TOKEN. `inspection: null` (network failure,
 * HTTP error, unreadable body) yields no refresh, no revocation and no alert — the job simply learned
 * nothing today and will ask again tomorrow. Treating a failed lookup as "invalid" would let one bad
 * response from Meta revoke every connection in the table at once.
 */
export function planTokenWork(input: {
  inspection: TokenInspection | null
  autoRefreshEnabled: boolean
  expiresAt: string | null
  now: Date
}): TokenPlan {
  if (!input.inspection) return { refresh: false, markRevoked: false, alert: null }

  if (!input.inspection.isValid) {
    // 🔴 NO REFRESH ATTEMPT. `fb_exchange_token` on a dead token cannot produce a live one; trying would
    // just be a second failure. The operator has to reconnect, and only the admin can chase that.
    return { refresh: false, markRevoked: true, alert: 'token_invalid' }
  }

  // 🔴 ZERO MEANS NEVER EXPIRES — Meta's sentinel, not 1970. A permanent token needs no refresh, and
  // treating zero as "expired 56 years ago" would refresh it every single night forever.
  if (input.inspection.expiresAt === 0) return { refresh: false, markRevoked: false, alert: null }

  // Prefer Meta's own expiry over our stored copy when it gave one — ours is derived, theirs is source.
  const expiryIso = input.inspection.expiresAt !== null
    ? new Date(input.inspection.expiresAt * 1000).toISOString()
    : input.expiresAt
  const left = daysUntil(expiryIso, input.now)

  // No expiry from either side: nothing to count down to, so nothing to do.
  if (left === null) return { refresh: false, markRevoked: false, alert: null }

  const due = left < REFRESH_WHEN_DAYS_LEFT_BELOW
  // ⚠️ THE FLAG GATES THE WRITE, NOT THE LOOK. Inspection and payment status still run with the flag
  // off, so the admin console and the alerts keep working while automatic refreshing stays parked.
  return { refresh: due && input.autoRefreshEnabled, markRevoked: false, alert: null }
}

/** PURE. A refresh was attempted and failed — how loud should the admin email be? */
export function classifyRefreshFailure(daysLeft: number | null): WhatsAppAlertKind {
  // Unknown runway is treated as urgent. It means we cannot tell how long we have, and the safe
  // assumption about an unknown deadline is that it is close.
  if (daysLeft === null) return 'token_refresh_urgent'
  return daysLeft < URGENT_WHEN_DAYS_LEFT_BELOW ? 'token_refresh_urgent' : 'token_refresh_failing'
}

/**
 * PURE. Is automatic refreshing switched on?
 * 🔴 DEFAULT OFF, AND THE COMPARISON IS EXACT. Anything other than the literal 'on' — unset, 'true',
 * '1', 'ON', a stray space — means off. This flag decides whether a cron rewrites live credentials for
 * every connected truck unattended; it should take a deliberate, exact act to enable, and every typo
 * should land on the side where nothing is rewritten.
 */
export const tokenAutoRefreshEnabled = (raw: string | undefined): boolean => raw === 'on'
