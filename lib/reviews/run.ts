// lib/reviews/run.ts — reviews-weather-1 (5 November 2026): one run of the review-request job (app/api/cron/review-requests).
// It reads through a ReviewStore (lib/reviews/store.ts against Supabase; an in-memory one in scripts/reviews-weather-1.cjs).
//
// 🔴 OFF UNLESS BOTH SWITCHES ARE ON: platform_switches.review_requests_enabled (global, false) and the truck's own
// truck_review_settings.review_requests_enabled (false) with a valid Google review link. The global switch is read FIRST and,
// when off, nothing else is read, scheduled or sent.
// Each run: 1 · schedule requests for orders completed in the last 48 hours; 2 · send the ones that are due, checking every
// rule again at send time; 3 · delete requests older than 120 days.
import { MAX_ATTEMPTS, KEEP_DAYS, checkGoogleReviewUrl, completionOf, decide, emailHash, normaliseEmail, newUnsubscribeToken, LOOKBACK_HOURS,
  type OrderFacts, type PriorRequest } from './model'

export type ReviewTruck = { truckId: string; name: string; contactEmail: string | null; enabled: boolean; reviewUrl: string | null; delayMinutes: number; active: boolean }
export type ReviewOrder = OrderFacts & { truckId: string; country: string | null; currency: string | null }
export type RequestRow = {
  id: string; truckId: string; orderKey: string; emailHash: string; locale: string; dueAt: string; status: string; attempts: number
  sentAt: string | null; unsubscribeToken: string; createdAt: string
}

export interface ReviewStore {
  globalEnabled(): Promise<boolean>
  enabledTrucks(): Promise<ReviewTruck[]>
  truck(truckId: string): Promise<ReviewTruck | null>
  /** Orders of the truck with a customer email, collected since `sinceIso` or on an event closed since then, with no request yet. */
  candidateOrders(truckId: string, sinceIso: string): Promise<ReviewOrder[]>
  order(orderKey: string): Promise<ReviewOrder | null>
  optedOut(truckId: string, hash: string): Promise<boolean>
  priorRequests(truckId: string, hash: string): Promise<PriorRequest[]>
  /** false when the order already has a request (the unique index). */
  insertRequest(r: Omit<RequestRow, 'id' | 'createdAt' | 'attempts' | 'sentAt'> & { completedAt: string; signal: string; skipReason: string | null }): Promise<boolean>
  dueRequests(nowIso: string, limit: number): Promise<RequestRow[]>
  updateRequest(id: string, patch: { status?: string; attempts?: number; sentAt?: string | null; skipReason?: string | null }): Promise<void>
  deleteRequestsBefore(iso: string): Promise<number>
  requestByToken(token: string): Promise<RequestRow | null>
  addOptOut(truckId: string, hash: string, source: 'link' | 'one_click'): Promise<void>
}

export type ReviewDeps = {
  now: () => Date
  /** The order's language: its country's locale (moneyFormatForOrder), as every customer email. */
  localeOf: (o: ReviewOrder) => Promise<string>
  send: (m: { to: string; truckName: string; replyTo: string | null; locale: string; reviewUrl: string; unsubscribeUrl: string }) => Promise<{ sent: boolean; reason?: string }>
  baseUrl: string
  isDemo: (truckId: string) => boolean
}

export type RunResult = { enabled: boolean; trucks: number; scheduled: number; skipped: Record<string, number>; sent: number; failed: number; dropped: number; pruned: number }

export const unsubscribeUrlOf = (base: string, token: string) => `${base.replace(/\/$/, '')}/api/reviews/unsubscribe?t=${token}`

export async function runReviewRequests(store: ReviewStore, deps: ReviewDeps): Promise<RunResult> {
  const r: RunResult = { enabled: false, trucks: 0, scheduled: 0, skipped: {}, sent: 0, failed: 0, dropped: 0, pruned: 0 }
  if (!(await store.globalEnabled())) return r
  r.enabled = true
  const now = deps.now(), nowIso = now.toISOString()
  const skip = (why: string) => { r.skipped[why] = (r.skipped[why] ?? 0) + 1 }

  // 1 · schedule
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000).toISOString()
  for (const t of await store.enabledTrucks()) {
    if (!usable(t, deps)) continue
    r.trucks++
    for (const o of await store.candidateOrders(t.truckId, since)) {
      const email = normaliseEmail(o.customerEmail)
      const hash = email ? emailHash(t.truckId, email) : ''
      const [out, prior] = email ? await Promise.all([store.optedOut(t.truckId, hash), store.priorRequests(t.truckId, hash)]) : [false, []]
      const d = decide({ truckId: t.truckId, order: o, delayMinutes: t.delayMinutes, nowIso, optedOut: () => out, prior: () => prior })
      if (!d.schedule) { skip(d.reason); continue }
      const ok = await store.insertRequest({
        truckId: t.truckId, orderKey: o.orderKey, emailHash: d.emailHash, locale: await deps.localeOf(o), dueAt: d.dueAt,
        status: 'scheduled', unsubscribeToken: newUnsubscribeToken(), completedAt: d.completedAt, signal: d.signal, skipReason: null,
      })
      if (ok) r.scheduled++; else skip('already_requested')
    }
  }

  // 2 · send what is due — every rule is checked again, because anything may have changed since it was scheduled
  for (const q of await store.dueRequests(nowIso, 200)) {
    const t = await store.truck(q.truckId)
    const o = await store.order(q.orderKey)
    const email = normaliseEmail(o?.customerEmail)
    const c = o ? completionOf(o) : null
    const url = t ? checkGoogleReviewUrl(t.reviewUrl) : null
    const why = !t || !usable(t, deps) || !url?.ok ? 'truck_off'
      : !o || !email || !c ? 'no_email'
      : !c.complete ? c.reason
      : emailHash(q.truckId, email) !== q.emailHash ? 'email_changed'
      : (await store.optedOut(q.truckId, q.emailHash)) ? 'opted_out'
      : null
    if (why || !t || !email || !url?.ok) { await store.updateRequest(q.id, { status: 'skipped', skipReason: why }); r.dropped++; skip(`at_send_${why}`); continue }
    const res = await deps.send({ to: email, truckName: t.name, replyTo: t.contactEmail, locale: q.locale, reviewUrl: url.url, unsubscribeUrl: unsubscribeUrlOf(deps.baseUrl, q.unsubscribeToken) })
    if (res.sent) { await store.updateRequest(q.id, { status: 'sent', sentAt: deps.now().toISOString(), attempts: q.attempts + 1 }); r.sent++ }
    else {
      const attempts = q.attempts + 1
      await store.updateRequest(q.id, attempts >= MAX_ATTEMPTS ? { status: 'failed', attempts, skipReason: res.reason ?? 'send_failed' } : { attempts })
      r.failed++
    }
  }

  // 3 · keep only what the 60-day rule needs
  r.pruned = await store.deleteRequestsBefore(new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString())
  return r
}

/** A truck that may be asked for: its switch on, a valid Google review link, active, not a demo. */
function usable(t: ReviewTruck, deps: ReviewDeps): boolean {
  return t.enabled && t.active && !deps.isDemo(t.truckId) && checkGoogleReviewUrl(t.reviewUrl).ok
}

/** The unsubscribe link: the request's token → an opt-out for that truck and customer. Works whether or not the switches are
 *  on (an emailed link must keep working). A token nobody was sent → null (the route answers 404). */
export async function unsubscribe(store: ReviewStore, token: string, source: 'link' | 'one_click'): Promise<{ truckId: string; locale: string } | null> {
  const q = await store.requestByToken(token)
  if (!q) return null
  await store.addOptOut(q.truckId, q.emailHash, source)
  return { truckId: q.truckId, locale: q.locale }
}
