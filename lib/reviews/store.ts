// lib/reviews/store.ts — reviews-weather-1 (5 November 2026): the ReviewStore (lib/reviews/run.ts) over Supabase, service role.
// Only the job and the unsubscribe route use it. Nothing here is imported by any customer page or the order paths.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { delayMinutesOf } from './model'
import type { ReviewStore, ReviewTruck, ReviewOrder, RequestRow } from './run'

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v : null)
const ORDER_COLS = 'order_key, truck_id, status, collected_at, customer_email, payment_status, event_id, country, currency'

function truckOf(settings: Row, truck: Row | null): ReviewTruck | null {
  if (!truck) return null
  return {
    truckId: String(settings.truck_id), name: s(truck.name) ?? '', contactEmail: s(truck.contact_email),
    enabled: settings.review_requests_enabled === true, reviewUrl: s(settings.google_review_url),
    delayMinutes: delayMinutesOf(settings.review_request_delay_minutes),
    active: truck.is_active !== false && truck.active !== false,
  }
}
const requestOf = (q: Row): RequestRow => ({
  id: String(q.id), truckId: String(q.truck_id), orderKey: String(q.order_key), emailHash: String(q.email_hash), locale: String(q.locale),
  dueAt: String(q.due_at), status: String(q.status), attempts: Number(q.attempts ?? 0), sentAt: s(q.sent_at), unsubscribeToken: String(q.unsubscribe_token),
  createdAt: String(q.created_at),
})

export function supabaseReviewStore(db: SupabaseClient): ReviewStore {
  async function ordersFacts(rows: Row[]): Promise<ReviewOrder[]> {
    if (!rows.length) return []
    const keys = rows.map(r => String(r.order_key))
    const eventIds = [...new Set(rows.map(r => s(r.event_id)).filter((x): x is string => !!x))]
    const [{ data: refunds }, { data: events }] = await Promise.all([
      db.from('order_payments').select('order_key').in('order_key', keys).eq('kind', 'refund').eq('state', 'succeeded'),
      eventIds.length ? db.from('truck_events').select('id, closed_at').in('id', eventIds) : Promise.resolve({ data: [] as Row[] }),
    ])
    const refunded = new Set((refunds ?? []).map(r => String((r as Row).order_key)))
    const closed = new Map((events ?? []).map(e => [String((e as Row).id), s((e as Row).closed_at)]))
    return rows.map(o => ({
      orderKey: String(o.order_key), truckId: String(o.truck_id), status: s(o.status), collectedAt: s(o.collected_at), customerEmail: s(o.customer_email),
      paymentStatus: s(o.payment_status), hasRefund: refunded.has(String(o.order_key)), eventClosedAt: o.event_id ? closed.get(String(o.event_id)) ?? null : null,
      country: s(o.country), currency: s(o.currency),
    }))
  }

  return {
    async globalEnabled() {
      const { data } = await db.from('platform_switches').select('review_requests_enabled').eq('id', true).maybeSingle()
      return (data as Row | null)?.review_requests_enabled === true
    },
    async enabledTrucks() {
      const { data: settings } = await db.from('truck_review_settings').select('*').eq('review_requests_enabled', true)
      const list = (settings ?? []) as Row[]
      if (!list.length) return []
      const { data: trucks } = await db.from('trucks').select('id, name, contact_email, is_active, active').in('id', list.map(x => String(x.truck_id)))
      const byId = new Map(((trucks ?? []) as Row[]).map(t => [String(t.id), t]))
      return list.map(x => truckOf(x, byId.get(String(x.truck_id)) ?? null)).filter((t): t is ReviewTruck => !!t)
    },
    async truck(truckId) {
      const [{ data: settings }, { data: truck }] = await Promise.all([
        db.from('truck_review_settings').select('*').eq('truck_id', truckId).maybeSingle(),
        db.from('trucks').select('id, name, contact_email, is_active, active').eq('id', truckId).maybeSingle(),
      ])
      return settings ? truckOf(settings as Row, (truck as Row | null) ?? null) : null
    },
    async candidateOrders(truckId, sinceIso) {
      const [{ data: collected }, { data: closedEvents }] = await Promise.all([
        db.from('orders').select(ORDER_COLS).eq('truck_id', truckId).eq('status', 'collected').gte('collected_at', sinceIso).not('customer_email', 'is', null),
        db.from('truck_events').select('id').eq('truck_id', truckId).gte('closed_at', sinceIso),
      ])
      const ids = ((closedEvents ?? []) as Row[]).map(e => String(e.id))
      const { data: onClosed } = ids.length
        ? await db.from('orders').select(ORDER_COLS).eq('truck_id', truckId).in('event_id', ids).in('status', ['confirmed', 'ready']).not('customer_email', 'is', null)
        : { data: [] as Row[] }
      const rows = [...((collected ?? []) as Row[]), ...((onClosed ?? []) as Row[])]
      if (!rows.length) return []
      const { data: asked } = await db.from('review_requests').select('order_key').in('order_key', rows.map(r => String(r.order_key)))
      const done = new Set(((asked ?? []) as Row[]).map(a => String(a.order_key)))
      return ordersFacts(rows.filter(r => !done.has(String(r.order_key))))
    },
    async order(orderKey) {
      const { data } = await db.from('orders').select(ORDER_COLS).eq('order_key', orderKey).maybeSingle()
      return data ? (await ordersFacts([data as Row]))[0] : null
    },
    async optedOut(truckId, hash) {
      const { data } = await db.from('review_request_optouts').select('truck_id').eq('truck_id', truckId).eq('email_hash', hash).maybeSingle()
      return !!data
    },
    async priorRequests(truckId, hash) {
      const { data } = await db.from('review_requests').select('status, due_at, sent_at').eq('truck_id', truckId).eq('email_hash', hash)
      return ((data ?? []) as Row[]).map(p => ({ status: String(p.status), dueAt: String(p.due_at), sentAt: s(p.sent_at) }))
    },
    async insertRequest(r) {
      const { error } = await db.from('review_requests').insert({
        truck_id: r.truckId, order_key: r.orderKey, email_hash: r.emailHash, locale: r.locale, completed_at: r.completedAt, completion_signal: r.signal,
        due_at: r.dueAt, status: r.status, skip_reason: r.skipReason, unsubscribe_token: r.unsubscribeToken,
      })
      return !error
    },
    async dueRequests(nowIso, limit) {
      const { data } = await db.from('review_requests').select('*').eq('status', 'scheduled').lte('due_at', nowIso).order('due_at', { ascending: true }).limit(limit)
      return ((data ?? []) as Row[]).map(requestOf)
    },
    async updateRequest(id, patch) {
      const row: Row = { updated_at: new Date().toISOString() }
      if (patch.status !== undefined) row.status = patch.status
      if (patch.attempts !== undefined) row.attempts = patch.attempts
      if (patch.sentAt !== undefined) row.sent_at = patch.sentAt
      if (patch.skipReason !== undefined) row.skip_reason = patch.skipReason
      await db.from('review_requests').update(row).eq('id', id)
    },
    async deleteRequestsBefore(iso) {
      const { data } = await db.from('review_requests').delete().lt('created_at', iso).select('id')
      return (data ?? []).length
    },
    async requestByToken(token) {
      const { data } = await db.from('review_requests').select('*').eq('unsubscribe_token', token).maybeSingle()
      return data ? requestOf(data as Row) : null
    },
    async addOptOut(truckId, hash, source) {
      const { data } = await db.from('review_request_optouts').select('truck_id').eq('truck_id', truckId).eq('email_hash', hash).maybeSingle()
      if (!data) await db.from('review_request_optouts').insert({ truck_id: truckId, email_hash: hash, source })
    },
  }
}
