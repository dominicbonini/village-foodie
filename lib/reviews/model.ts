// lib/reviews/model.ts — reviews-weather-1 (5 November 2026, docs/reviews-weather-1-report.md): Google review requests, the RULES.
// Pure: no database, no network, no clock (every "now" is a parameter). lib/reviews/run.ts applies them; the harness proves them.
//
// 🔴 GOOGLE'S RULE: ASK EVERY CUSTOMER THE SAME WAY. There is no satisfaction step, no "only happy customers" filter, and no
// rating question before the link (Google: "Don't discourage or prohibit negative reviews or selectively solicit positive
// reviews from customers"). Every eligible order gets the same email with the same one link.
import { createHash, randomBytes } from 'node:crypto'

export const REVIEW_REPEAT_DAYS = 60
export const DEFAULT_DELAY_MINUTES = 60
export const MAX_DELAY_MINUTES = 7 * 24 * 60
/** Orders completed longer ago than this are never picked up (a switch turned on does not mail last month's customers). */
export const LOOKBACK_HOURS = 48
/** A request that failed this many sends is given up. */
export const MAX_ATTEMPTS = 3
/** Requests older than this are deleted (the 60-day rule only needs 60 days). */
export const KEEP_DAYS = 120

// ── the Google review link ──────────────────────────────────────────────────────────────────────────────────────────────
export type UrlCheck = { ok: true; url: string } | { ok: false; reason: 'empty' | 'not_url' | 'not_https' | 'not_google_review' | 'too_long' }

/** A truck's Google review link: https only, and one of Google's two review-link shapes —
 *    https://search.google.com/local/writereview?placeid=<place id>
 *    https://g.page/r/<code>  (optionally …/review)
 *  No credentials, no port, the host exactly (not a look-alike such as g.page.example.com). Returns the normalised URL. */
export function checkGoogleReviewUrl(raw: unknown): UrlCheck {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'empty' }
  const s = raw.trim()
  if (s.length > 500) return { ok: false, reason: 'too_long' }
  let u: URL
  try { u = new URL(s) } catch { return { ok: false, reason: 'not_url' } }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' }
  if (u.username || u.password || u.port) return { ok: false, reason: 'not_google_review' }
  const host = u.hostname.toLowerCase()
  if (host === 'search.google.com' && u.pathname === '/local/writereview') {
    const placeId = u.searchParams.get('placeid')
    if (!placeId || !/^[A-Za-z0-9_-]{10,200}$/.test(placeId)) return { ok: false, reason: 'not_google_review' }
    return { ok: true, url: `https://search.google.com/local/writereview?placeid=${placeId}` }
  }
  if (host === 'g.page') {
    const m = /^\/r\/([A-Za-z0-9_-]{6,100})(\/review)?\/?$/.exec(u.pathname)
    if (!m || u.search) return { ok: false, reason: 'not_google_review' }
    return { ok: true, url: `https://g.page/r/${m[1]}${m[2] ?? ''}` }
  }
  return { ok: false, reason: 'not_google_review' }
}

/** The delay in minutes: a whole number 0 … 7 days, else the default. */
export function delayMinutesOf(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 && n <= MAX_DELAY_MINUTES ? n : DEFAULT_DELAY_MINUTES
}

// ── the customer ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A usable customer email, lower-cased and trimmed, or null. */
export function normaliseEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/** The customer as stored: sha256 of the truck id and the email, so the address itself is never kept and the same customer at
 *  two trucks cannot be linked. */
export function emailHash(truckId: string, email: string): string {
  return createHash('sha256').update(`${truckId}\n${email}`).digest('hex')
}

/** 24 random bytes as base64url: 32 characters (the table's CHECK). */
export function newUnsubscribeToken(): string {
  return randomBytes(24).toString('base64url')
}
export const isToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t)

// ── when an order is complete ───────────────────────────────────────────────────────────────────────────────────────────
// THE SIGNAL (diagnosed 5 Nov, read-only): orders go pending → confirmed → ready → collected, or cancelled / rejected
// (and `modified` while a change waits for the customer). Most trucks never press "collected": 315 orders with an email were
// collected, 1,481 were left `confirmed` / `ready` on events that have since CLOSED. So an order is complete when:
//   1. it is `collected` — at `collected_at`; or
//   2. it is `confirmed` or `ready` and its event has closed — at the event's `closed_at`.
// Never: pending, modified, cancelled, rejected; never a refunded order (payment_status refunded / refund_due, or a
// succeeded refund in the payment ledger).
export type OrderFacts = {
  orderKey: string
  status: string | null
  collectedAt: string | null
  customerEmail: string | null
  paymentStatus: string | null
  /** A succeeded `refund` row in order_payments. */
  hasRefund: boolean
  eventClosedAt: string | null
}
export type Completion =
  | { complete: true; at: string; signal: 'collected' | 'event_closed' }
  | { complete: false; reason: 'not_complete' | 'cancelled' | 'refunded' | 'no_time' }

export function completionOf(o: OrderFacts): Completion {
  if (o.status === 'cancelled' || o.status === 'rejected') return { complete: false, reason: 'cancelled' }
  if (o.hasRefund || o.paymentStatus === 'refunded' || o.paymentStatus === 'refund_due') return { complete: false, reason: 'refunded' }
  if (o.status === 'collected') return o.collectedAt ? { complete: true, at: o.collectedAt, signal: 'collected' } : { complete: false, reason: 'no_time' }
  if ((o.status === 'confirmed' || o.status === 'ready') && o.eventClosedAt) return { complete: true, at: o.eventClosedAt, signal: 'event_closed' }
  return { complete: false, reason: 'not_complete' }
}

export const dueAtOf = (completedAt: string, delayMinutes: number): string => new Date(Date.parse(completedAt) + delayMinutes * 60_000).toISOString()

/** A request already counts against the 60 days when it is scheduled or sent, timed by when it is (or was) due. */
export type PriorRequest = { status: string; dueAt: string; sentAt: string | null }
export function askedWithin(prior: PriorRequest[], aroundIso: string, days = REVIEW_REPEAT_DAYS): boolean {
  const t = Date.parse(aroundIso), span = days * 86_400_000
  return prior.some(p => (p.status === 'scheduled' || p.status === 'sent') && Math.abs(Date.parse(p.sentAt ?? p.dueAt) - t) < span)
}

// ── the decision for one order ──────────────────────────────────────────────────────────────────────────────────────────
export type Decision =
  | { schedule: true; emailHash: string; completedAt: string; signal: 'collected' | 'event_closed'; dueAt: string }
  | { schedule: false; reason: 'no_email' | 'not_complete' | 'cancelled' | 'refunded' | 'no_time' | 'too_old' | 'opted_out' | 'asked_recently'; emailHash?: string }

export function decide(args: {
  truckId: string
  order: OrderFacts
  delayMinutes: number
  nowIso: string
  optedOut: (hash: string) => boolean
  prior: (hash: string) => PriorRequest[]
}): Decision {
  const email = normaliseEmail(args.order.customerEmail)
  if (!email) return { schedule: false, reason: 'no_email' }
  const c = completionOf(args.order)
  if (!c.complete) return { schedule: false, reason: c.reason }
  if (Date.parse(args.nowIso) - Date.parse(c.at) > LOOKBACK_HOURS * 3_600_000) return { schedule: false, reason: 'too_old' }
  const hash = emailHash(args.truckId, email)
  if (args.optedOut(hash)) return { schedule: false, reason: 'opted_out', emailHash: hash }
  const dueAt = dueAtOf(c.at, delayMinutesOf(args.delayMinutes))
  if (askedWithin(args.prior(hash), dueAt)) return { schedule: false, reason: 'asked_recently', emailHash: hash }
  return { schedule: true, emailHash: hash, completedAt: c.at, signal: c.signal, dueAt }
}
