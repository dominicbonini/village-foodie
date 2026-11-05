#!/usr/bin/env node
// scripts/reviews-weather-1.cjs — reviews-weather-1 (5 November 2026, docs/reviews-weather-1-report.md): Google review requests and
// weather per stop, backend only, switched off. NO NETWORK, NO DATABASE: the real libraries, stores and routes run over an
// in-memory Supabase; Brevo and the weather provider answer from fixtures.
//   1 · the migration          2 · the Google review link and the delay      3 · when an order is complete
//   4 · scheduling, the 60 days, opt-outs, the switches (the real Supabase store)   5 · sending   6 · the email
//   7 · unsubscribe            8 · the weather rules        9 · the OpenWeather provider   10 · caching, refresh, fallback
//   11 · the routes, switched off and on   12 · the words   13 · nothing live touched
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'reviews-weather-1' })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const H = 3_600_000, D = 24 * H

// ── an in-memory Supabase (the shape the stores use, with upsert) ────────────────────────────────────────────────────────
function fakeDb(seed) {
  const T = {}; for (const [k, v] of Object.entries(seed)) T[k] = v.map(r => ({ ...r }))
  const calls = []
  let n = 0
  const DEFAULTS = {
    review_requests: r => ({ id: `rq-${++n}`, attempts: 0, sent_at: null, skip_reason: null, created_at: new Date(globalThis.__now ?? Date.now()).toISOString(), updated_at: null, ...r }),
    review_request_optouts: r => ({ created_at: new Date().toISOString(), ...r }),
  }
  const UNIQUE = { review_requests: ['order_key', 'unsubscribe_token'], review_request_optouts: [['truck_id', 'email_hash']] }
  function from(table) {
    calls.push(table)
    const filters = []; let op = 'select', payload = null, single = null, order = null, limitN = null, conflict = null
    const self = {
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
      select() { return self }, insert(rows) { op = 'insert'; payload = [].concat(rows); return self },
      upsert(rows, o = {}) { op = 'upsert'; payload = [].concat(rows); conflict = o.onConflict; return self },
      update(v) { op = 'update'; payload = v; return self }, delete() { op = 'delete'; return self },
      eq(k, v) { filters.push(r => r[k] === v); return self }, neq(k, v) { filters.push(r => r[k] !== v); return self },
      in(k, vs) { filters.push(r => vs.includes(r[k])); return self }, is(k, v) { filters.push(r => (r[k] ?? null) === v); return self },
      gte(k, v) { filters.push(r => r[k] != null && String(r[k]) >= String(v)); return self }, lte(k, v) { filters.push(r => r[k] != null && String(r[k]) <= String(v)); return self },
      lt(k, v) { filters.push(r => r[k] != null && String(r[k]) < String(v)); return self }, gt(k, v) { filters.push(r => r[k] != null && String(r[k]) > String(v)); return self },
      not(k, o, v) { if (o === 'is') filters.push(r => (r[k] ?? null) !== v); return self },
      order(k, o = {}) { order = { k, asc: o.ascending !== false }; return self }, limit(x) { limitN = x; return self },
      maybeSingle() { single = 'maybe'; return self }, single() { single = 'one'; return self },
    }
    const out = list => { const c = list.map(r => ({ ...r })); return single === 'maybe' ? { data: c[0] ?? null, error: null } : single === 'one' ? (c.length === 1 ? { data: c[0], error: null } : { data: null, error: { message: 'not one' } }) : { data: c, error: null } }
    function dup(rows, m) { return (UNIQUE[table] ?? []).some(u => rows.some(r => [].concat(u).every(k => r[k] === m[k]))) }
    function run() {
      const rows = (T[table] ??= [])
      if (op === 'insert') {
        const made = payload.map(r => (DEFAULTS[table] ? DEFAULTS[table](r) : { ...r }))
        if (made.some(m => dup(rows, m))) return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
        rows.push(...made); return out(made)
      }
      if (op === 'upsert') {
        for (const m of payload) { const i = rows.findIndex(r => r[conflict] === m[conflict]); if (i >= 0) rows[i] = { ...rows[i], ...m }; else rows.push({ ...m }) }
        return out(payload)
      }
      let hit = rows.filter(r => filters.every(f => f(r)))
      if (op === 'update') { hit.forEach(r => Object.assign(r, payload)); return out(hit) }
      if (op === 'delete') { T[table] = rows.filter(r => !hit.includes(r)); return out(hit) }
      if (order) hit = [...hit].sort((a, b) => (String(a[order.k]) < String(b[order.k]) ? -1 : 1) * (order.asc ? 1 : -1))
      if (limitN != null) hit = hit.slice(0, limitN)
      return out(hit)
    }
    return self
  }
  return { from, T, calls }
}

const LOCALE_OF = { GB: 'en-GB', DE: 'de-DE', US: 'en-US', FR: 'fr-FR' }
const TZ_OF = { GB: 'Europe/London', DE: 'Europe/Berlin', US: 'America/New_York' }
const STUBS = {
  '@/lib/truck-access': "export async function resolveTruckAccessWith() { return globalThis.__access ?? { ok: true, role: 'staff' } }",
  '@/lib/auth/admin': 'export async function verifyAdmin() { return false }',
  '@/lib/truck-time': `const Z = ${JSON.stringify(TZ_OF)}\nexport async function truckTimeZone(t) { return (t && t.timezone) || Z[t && t.country] || 'Europe/London' }`,
  '@/lib/money-server': `const L = ${JSON.stringify(LOCALE_OF)}\nexport async function moneyFormatForOrder(o) { return { locale: L[o.country] || 'en-GB', currency: o.currency || 'GBP' } }`,
}

;(async () => {
  const L = await kit.bundle('rw1', [
    "export * as RM from '@/lib/reviews/model'",
    "export { runReviewRequests, unsubscribe, unsubscribeUrlOf } from '@/lib/reviews/run'",
    "export { supabaseReviewStore } from '@/lib/reviews/store'",
    "export { reviewEmail, sendReviewEmail, reviewFromName } from '@/lib/reviews/email'",
    "export * as WM from '@/lib/weather/model'",
    "export { parseOneCall, iconFromOpenWeather, openWeatherProvider } from '@/lib/weather/openweather'",
    "export { refreshWeather, weatherForTruck } from '@/lib/weather/run'",
    "export { supabaseWeatherStore } from '@/lib/weather/store'",
    "export { GET as reviewCron } from '@/app/api/cron/review-requests/route'",
    "export { GET as weatherCron } from '@/app/api/cron/weather/route'",
    "export { POST as weatherPOST } from '@/app/api/manage/weather/route'",
    "export { GET as unsubGET, POST as unsubPOST } from '@/app/api/reviews/unsubscribe/route'",
  ].join('\n'), { stubs: STUBS })
  const { RM, WM } = L

  // ══ 1 ══
  head('1 · the migration (20261072)')
  const SQL = read('supabase/migrations/20261072_reviews_weather_1.sql')
  const code = SQL.replace(/--.*$/gm, '')
  t('six new tables, each with RLS on and nothing granted to anon or authenticated', ['platform_switches', 'truck_review_settings', 'review_requests', 'review_request_optouts', 'weather_hourly', 'event_weather'].every(x => code.includes(`create table if not exists public.${x}`) && code.includes(`alter table public.${x} enable row level security`))
    && /revoke all on public\.platform_switches, public\.truck_review_settings, public\.review_requests, public\.review_request_optouts,\s+public\.weather_hourly, public\.event_weather from anon, authenticated/.test(code))
  t('both global switches default OFF, one row', /review_requests_enabled\s+boolean not null default false,\s+weather_enabled\s+boolean not null default false/.test(code) && /insert into public\.platform_switches \(id\) values \(true\) on conflict \(id\) do nothing/.test(code))
  t('per truck: review_requests_enabled false, google_review_url (https only, ≤ 500), delay 60 (0 … 7 days)', /review_requests_enabled\s+boolean not null default false/.test(code.split('truck_review_settings (')[1]) && /google_review_url ~ '\^https:\/\/'/.test(code) && /review_request_delay_minutes\s+integer not null default 60 check \(review_request_delay_minutes between 0 and 10080\)/.test(code))
  t('one request per order (order_key, the orders primary key); the customer only as a 64-hex hash; a 32-character token', /unique \(order_key\)/.test(code) && /order_key\s+uuid not null references public\.orders\(order_key\)/.test(code) && /email_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(code) && /unsubscribe_token ~ '\^\[A-Za-z0-9_-\]\{32\}\$'/.test(code) && !/customer_email|email text/.test(code))
  t('no row of any existing table is written (the runner\'s protected-table rule finds nothing)', !/\b(update|delete\s+from|truncate)\s+(only\s+)?(public\.)?"?(trucks|orders|plans|plan_prices|plan_features|country_settings)\b/i.test(code) && !/alter table public\.(trucks|orders|truck_events)\b/.test(code))

  // ══ 2 ══
  head('2 · the Google review link and the delay')
  const U = RM.checkGoogleReviewUrl
  const okUrls = [
    ['https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4', 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4'],
    ['  https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4&hl=en&utm=x  ', 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4'],
    ['https://g.page/r/CbAbC123xyz', 'https://g.page/r/CbAbC123xyz'], ['https://g.page/r/CbAbC123xyz/review', 'https://g.page/r/CbAbC123xyz/review'],
  ]
  t('accepted (and normalised): search.google.com/local/writereview?placeid=… and g.page/r/… (…/review)', okUrls.every(([i, o]) => U(i).ok && U(i).url === o), okUrls.map(([i]) => U(i)))
  const bad = { 'http://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4': 'not_https', 'https://g.page.evil.com/r/CbAbC123xyz': 'not_google_review',
    'https://evil.com/search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4': 'not_google_review', 'https://search.google.com/local/writereview': 'not_google_review',
    'https://search.google.com/maps?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4': 'not_google_review', 'https://user:pw@g.page/r/CbAbC123xyz': 'not_google_review', 'https://g.page:8443/r/CbAbC123xyz': 'not_google_review',
    'https://g.page/r/CbAbC123xyz?x=1': 'not_google_review', 'javascript:alert(1)': 'not_https', 'not a url': 'not_url', '': 'empty', ['https://g.page/r/' + 'a'.repeat(600)]: 'too_long' }
  t('refused: http, look-alike hosts, other paths, no place id, credentials, a port, a query on g.page, javascript:, junk, empty, too long', Object.entries(bad).every(([i, why]) => !U(i).ok && U(i).reason === why) && !U(null).ok && !U(42).ok, Object.entries(bad).map(([i, w]) => [i.slice(0, 40), U(i).reason, w]))
  t('the delay: 60 by default; 0 … 10080 kept; anything else → 60', RM.delayMinutesOf(undefined) === 60 && RM.delayMinutesOf(0) === 0 && RM.delayMinutesOf(90) === 90 && RM.delayMinutesOf(10080) === 10080 && RM.delayMinutesOf(10081) === 60 && RM.delayMinutesOf(-1) === 60 && RM.delayMinutesOf(1.5) === 60 && RM.delayMinutesOf('30') === 30)

  // ══ 3 ══
  head('3 · when an order is complete')
  const C = o => RM.completionOf({ orderKey: 'k', status: 'confirmed', collectedAt: null, customerEmail: 'a@b.co', paymentStatus: 'paid', hasRefund: false, eventClosedAt: null, ...o })
  t('collected → complete at collected_at', JSON.stringify(C({ status: 'collected', collectedAt: '2026-11-01T12:00:00Z' })) === JSON.stringify({ complete: true, at: '2026-11-01T12:00:00Z', signal: 'collected' }))
  t('confirmed or ready on an event that has closed → complete at the event\'s closed_at', C({ eventClosedAt: '2026-11-01T15:00:00Z' }).signal === 'event_closed' && C({ status: 'ready', eventClosedAt: '2026-11-01T15:00:00Z' }).at === '2026-11-01T15:00:00Z')
  t('not complete: pending, modified, or confirmed on an event still open; collected with no time', C({}).reason === 'not_complete' && C({ status: 'pending', eventClosedAt: 'x' }).reason === 'not_complete' && C({ status: 'modified', eventClosedAt: 'x' }).reason === 'not_complete' && C({ status: 'collected' }).reason === 'no_time')
  t('never cancelled or rejected; never refunded (payment_status refunded or refund_due, or a succeeded ledger refund)', C({ status: 'cancelled', eventClosedAt: 'x' }).reason === 'cancelled' && C({ status: 'rejected' }).reason === 'cancelled'
    && C({ status: 'collected', collectedAt: 'x', paymentStatus: 'refunded' }).reason === 'refunded' && C({ status: 'collected', collectedAt: 'x', paymentStatus: 'refund_due' }).reason === 'refunded' && C({ status: 'collected', collectedAt: 'x', hasRefund: true }).reason === 'refunded')
  t('the email: trimmed, lower-cased, kept only if it looks like an address; stored as sha256(truck id + email), never the address', RM.normaliseEmail('  Ann@Example.COM ') === 'ann@example.com' && RM.normaliseEmail('nope') === null && /^[0-9a-f]{64}$/.test(RM.emailHash('t1', 'ann@example.com')) && RM.emailHash('t1', 'ann@example.com') !== RM.emailHash('t2', 'ann@example.com'))
  t('tokens: 32 base64url characters, 1,000 unique', (() => { const s = new Set(); for (let i = 0; i < 1000; i++) s.add(RM.newUnsubscribeToken()); return s.size === 1000 && [...s].every(RM.isToken) })())

  // ══ 4 ══ scheduling over the real Supabase store
  head('4 · scheduling: the switches, completion, 60 days per customer per truck, opt-outs (the real store)')
  const NOW = Date.parse('2026-11-05T20:00:00Z')
  const iso = ms => new Date(ms).toISOString()
  const URL_OK = 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4'
  const order = (key, o) => ({ order_key: key, truck_id: 'test-truck', status: 'collected', collected_at: iso(NOW - 3 * H), customer_email: `${key}@example.com`, payment_status: 'paid', event_id: 'ev-open', country: 'GB', currency: 'GBP', ...o })
  function world(over = {}) {
    return fakeDb({
      platform_switches: [{ id: true, review_requests_enabled: true, weather_enabled: false }],
      trucks: [{ id: 'test-truck', name: 'Pizza <Kitchen>', contact_email: 'owner@pk.test', is_active: true, active: true, country: 'GB' },
        { id: 'test-truck-2', name: 'Taco Two', contact_email: null, is_active: true, active: true, country: 'DE' },
        { id: 'demo-abc', name: 'Demo', contact_email: null, is_active: true, active: true, country: 'GB' },
        { id: 'sleepy', name: 'Sleepy', contact_email: null, is_active: false, active: true, country: 'GB' }],
      truck_review_settings: [{ truck_id: 'test-truck', review_requests_enabled: true, google_review_url: URL_OK, review_request_delay_minutes: 60 },
        { truck_id: 'test-truck-2', review_requests_enabled: true, google_review_url: 'https://g.page/r/CbAbC123xyz', review_request_delay_minutes: 30 },
        { truck_id: 'demo-abc', review_requests_enabled: true, google_review_url: URL_OK, review_request_delay_minutes: 60 },
        { truck_id: 'sleepy', review_requests_enabled: true, google_review_url: URL_OK, review_request_delay_minutes: 60 }],
      truck_events: [{ id: 'ev-open', truck_id: 'test-truck', closed_at: null }, { id: 'ev-closed', truck_id: 'test-truck', closed_at: iso(NOW - 2 * H) },
        { id: 'ev2', truck_id: 'test-truck-2', closed_at: iso(NOW - 2 * H) }, { id: 'ev-demo', truck_id: 'demo-abc', closed_at: iso(NOW - 2 * H) }, { id: 'ev-sleepy', truck_id: 'sleepy', closed_at: iso(NOW - 2 * H) }],
      order_payments: [{ order_key: 'refunded-ledger', kind: 'refund', state: 'succeeded' }, { order_key: 'failed-refund', kind: 'refund', state: 'failed' }],
      orders: [
        order('collected'), order('closed-confirmed', { status: 'confirmed', collected_at: null, event_id: 'ev-closed' }), order('closed-ready', { status: 'ready', collected_at: null, event_id: 'ev-closed' }),
        order('open-confirmed', { status: 'confirmed', collected_at: null }), order('pending', { status: 'pending', collected_at: null, event_id: 'ev-closed' }),
        order('cancelled', { status: 'cancelled', event_id: 'ev-closed' }), order('refunded-status', { payment_status: 'refunded' }), order('refunded-ledger'), order('failed-refund'),
        order('walkup', { customer_email: null }), order('old', { collected_at: iso(NOW - 50 * H) }),
        order('same-customer-1', { customer_email: 'Repeat@Example.com' }), order('same-customer-2', { customer_email: 'repeat@example.com', collected_at: iso(NOW - 2 * H) }),
        order('t2-repeat', { truck_id: 'test-truck-2', customer_email: 'repeat@example.com', status: 'ready', collected_at: null, event_id: 'ev2', country: 'DE', currency: 'EUR' }),
        order('opted-out', { customer_email: 'gone@example.com' }), order('asked-59', { customer_email: 'recent@example.com' }), order('asked-61', { customer_email: 'longago@example.com' }),
        order('demo-order', { truck_id: 'demo-abc', event_id: 'ev-demo' }), order('sleepy-order', { truck_id: 'sleepy', event_id: 'ev-sleepy' }),
      ],
      review_requests: [
        { id: 'old-59', truck_id: 'test-truck', order_key: 'x59', email_hash: RM.emailHash('test-truck', 'recent@example.com'), locale: 'en-GB', due_at: iso(NOW - 59 * D), status: 'sent', sent_at: iso(NOW - 59 * D), attempts: 1, unsubscribe_token: 'A'.repeat(32), created_at: iso(NOW - 59 * D) },
        { id: 'old-61', truck_id: 'test-truck', order_key: 'x61', email_hash: RM.emailHash('test-truck', 'longago@example.com'), locale: 'en-GB', due_at: iso(NOW - 61 * D), status: 'sent', sent_at: iso(NOW - 61 * D), attempts: 1, unsubscribe_token: 'B'.repeat(32), created_at: iso(NOW - 61 * D) },
        { id: 'ancient', truck_id: 'test-truck', order_key: 'x200', email_hash: RM.emailHash('test-truck', 'ancient@example.com'), locale: 'en-GB', due_at: iso(NOW - 200 * D), status: 'sent', sent_at: iso(NOW - 200 * D), attempts: 1, unsubscribe_token: 'C'.repeat(32), created_at: iso(NOW - 200 * D) },
      ],
      review_request_optouts: [{ truck_id: 'test-truck', email_hash: RM.emailHash('test-truck', 'gone@example.com'), source: 'link' }],
      ...over,
    })
  }
  const sent = []
  const deps = (o = {}) => ({ now: () => new Date(globalThis.__now ?? NOW), localeOf: async x => LOCALE_OF[x.country] ?? 'en-GB', isDemo: id => id.startsWith('demo-'), baseUrl: 'https://www.hatchgrab.com',
    send: async m => { sent.push(m); return o.sendOk === false ? { sent: false, reason: 'Brevo 500' } : { sent: true } }, ...o })

  // global switch off
  let db = world({ platform_switches: [{ id: true, review_requests_enabled: false, weather_enabled: false }] })
  let res = await L.runReviewRequests(L.supabaseReviewStore(db), deps())
  t('🔴 global switch OFF: nothing is read beyond the switch, nothing scheduled, nothing sent', res.enabled === false && res.scheduled === 0 && res.sent === 0 && sent.length === 0 && JSON.stringify(db.calls) === '["platform_switches"]', db.calls)

  db = world({ platform_switches: [] })
  res = await L.runReviewRequests(L.supabaseReviewStore(db), deps())
  t('no switches row at all reads as OFF', res.enabled === false && sent.length === 0)

  // global on, one truck switched off
  db = world()
  db.T.truck_review_settings[1].review_requests_enabled = false
  db.T.truck_review_settings[0].google_review_url = 'https://evil.example/review'
  res = await L.runReviewRequests(L.supabaseReviewStore(db), deps())
  t('a truck with its switch off, or with a link that is not a Google review link, schedules nothing', res.enabled && res.scheduled === 0 && db.T.review_requests.every(r => ['old-59', 'old-61'].includes(r.id)))

  globalThis.__now = NOW
  db = world()
  res = await L.runReviewRequests(L.supabaseReviewStore(db), deps())
  const reqs = db.T.review_requests.filter(r => !['old-59', 'old-61', 'ancient'].includes(r.id))
  const keys = reqs.map(r => r.order_key).sort()
  t('scheduled: collected, confirmed and ready on a closed event, one of the repeat customer\'s two, the other truck\'s, and the 61-days-ago customer',
    JSON.stringify(keys.map(k => k.replace(/^same-customer-\d$/, 'same-customer'))) === JSON.stringify(['asked-61', 'closed-confirmed', 'closed-ready', 'collected', 'failed-refund', 'same-customer', 't2-repeat']), keys)
  t('not scheduled: open event, pending, cancelled, refunded (status and ledger), no email, older than 48 hours, demo truck, inactive truck', ['open-confirmed', 'pending', 'cancelled', 'refunded-status', 'refunded-ledger', 'walkup', 'old', 'demo-order', 'sleepy-order'].every(k => !keys.includes(k)))
  t('🔴 at most one per customer per truck per 60 days: Repeat@ and repeat@ are one customer (the second order is skipped); 59 days ago blocks, 61 days ago does not',
    keys.filter(k => k.startsWith('same-customer')).length === 1 && !keys.includes('asked-59') && keys.includes('asked-61') && res.skipped.asked_recently === 2, res.skipped)
  t('…per truck: the same customer at another truck is asked by that truck', keys.includes('t2-repeat'))
  t('🔴 an unsubscribed customer is not scheduled', !keys.includes('opted-out') && res.skipped.opted_out === 1)
  const rq = k => reqs.find(r => r.order_key === k)
  t('due at completion + the truck\'s delay (60 min after collected_at; 30 min after the event closed for the other truck); signal recorded',
    rq('collected').due_at === iso(NOW - 3 * H + 60 * 60_000) && rq('collected').completion_signal === 'collected' && rq('t2-repeat').due_at === iso(NOW - 2 * H + 30 * 60_000) && rq('closed-ready').completion_signal === 'event_closed')
  t('in the order\'s language (its country: GB → en-GB, DE → de-DE); the customer only as the hash; a fresh 32-character token each', rq('collected').locale === 'en-GB' && rq('t2-repeat').locale === 'de-DE' && rq('collected').email_hash === RM.emailHash('test-truck', 'collected@example.com') && !JSON.stringify(db.T.review_requests).includes('@example.com') && new Set(reqs.map(r => r.unsubscribe_token)).size === reqs.length && reqs.every(r => RM.isToken(r.unsubscribe_token)))

  // ══ 5 ══ sending
  head('5 · sending, with every rule checked again at send time')
  t('the same run sent what was already due (all of them: every delay has passed), and pruned the request older than 120 days', res.sent === 7 && sent.length === 7 && res.pruned === 1 && !db.T.review_requests.some(r => r.id === 'ancient'))
  const m1 = sent.find(m => m.to === 'collected@example.com')
  t('each send: the customer\'s address (read from the order at send time), the truck\'s name, Reply-To the truck, the normalised Google link, the unsubscribe link with its token, the locale',
    m1 && m1.truckName === 'Pizza <Kitchen>' && m1.replyTo === 'owner@pk.test' && m1.reviewUrl === URL_OK && m1.unsubscribeUrl === `https://www.hatchgrab.com/api/reviews/unsubscribe?t=${rq('collected').unsubscribe_token}` && m1.locale === 'en-GB')
  t('marked sent with the time; a second run schedules and sends nothing more (one per order)', reqs.every(r => r.status === 'sent' && r.sent_at) && await (async () => { sent.length = 0; const r2 = await L.runReviewRequests(L.supabaseReviewStore(db), deps()); return r2.scheduled === 0 && r2.sent === 0 && sent.length === 0 })())

  // later events: due in the future, changes before sending
  sent.length = 0
  db = world({ orders: [order('a', { collected_at: iso(NOW - 10 * 60_000) }), order('b', { collected_at: iso(NOW - 10 * 60_000), customer_email: 'b@example.com' }), order('c', { collected_at: iso(NOW - 10 * 60_000), customer_email: 'c@example.com' }), order('d', { collected_at: iso(NOW - 10 * 60_000), customer_email: 'd@example.com' })], review_requests: [] })
  res = await L.runReviewRequests(L.supabaseReviewStore(db), deps())
  t('not yet due (10 minutes after collection, delay 60): scheduled, not sent', res.scheduled === 4 && res.sent === 0 && db.T.review_requests.every(r => r.status === 'scheduled'))
  db.T.orders.find(o => o.order_key === 'a').status = 'cancelled'
  db.T.orders.find(o => o.order_key === 'b').payment_status = 'refunded'
  db.T.review_request_optouts.push({ truck_id: 'test-truck', email_hash: RM.emailHash('test-truck', 'c@example.com'), source: 'link' })
  globalThis.__now = NOW + 55 * 60_000
  res = await L.runReviewRequests(L.supabaseReviewStore(db), deps())
  const st = k => db.T.review_requests.find(r => r.order_key === k)
  t('🔴 at send time: cancelled since → skipped; refunded since → skipped; unsubscribed since → skipped; only the fourth is sent', st('a').status === 'skipped' && st('a').skip_reason === 'cancelled' && st('b').skip_reason === 'refunded' && st('c').skip_reason === 'opted_out' && st('d').status === 'sent' && sent.length === 1 && sent[0].to === 'd@example.com', db.T.review_requests.map(r => [r.order_key, r.status, r.skip_reason]))
  sent.length = 0
  db = world({ orders: [order('e', { collected_at: iso(NOW - 2 * H) })], review_requests: [] })
  globalThis.__now = NOW
  await L.runReviewRequests(L.supabaseReviewStore(db), deps({ sendOk: false }))
  const e1 = db.T.review_requests[0]
  t('a failed send is kept and tried again (attempts 1, still scheduled)', e1.status === 'scheduled' && e1.attempts === 1)
  await L.runReviewRequests(L.supabaseReviewStore(db), deps({ sendOk: false })); await L.runReviewRequests(L.supabaseReviewStore(db), deps({ sendOk: false }))
  t('…and given up after three (failed, with the reason)', e1.status === 'failed' && e1.attempts === 3 && e1.skip_reason === 'Brevo 500')
  db = world({ orders: [order('f', { collected_at: iso(NOW - 2 * H) })], review_requests: [] })
  await L.runReviewRequests(L.supabaseReviewStore(db), deps({ now: () => new Date(NOW - 2 * H + 5 * 60_000) }))
  db.T.platform_switches[0].review_requests_enabled = false
  sent.length = 0
  const off = await L.runReviewRequests(L.supabaseReviewStore(db), deps())
  t('🔴 a request scheduled while on is NOT sent once the global switch is off', off.enabled === false && sent.length === 0 && db.T.review_requests[0].status === 'scheduled')
  db.T.platform_switches[0].review_requests_enabled = true
  db.T.truck_review_settings[0].review_requests_enabled = false
  await L.runReviewRequests(L.supabaseReviewStore(db), deps())
  t('…nor once the truck\'s switch is off (skipped, truck_off)', sent.length === 0 && db.T.review_requests[0].status === 'skipped' && db.T.review_requests[0].skip_reason === 'truck_off')

  // ══ 6 ══
  head('6 · the email')
  const E = L.reviewEmail({ locale: 'en-GB', truckName: 'Pizza <Kitchen> & Co', reviewUrl: URL_OK, unsubscribeUrl: 'https://www.hatchgrab.com/api/reviews/unsubscribe?t=' + 'A'.repeat(32) })
  const en = JSON.parse(read('messages/en-GB.json')).emailReview
  t('subject and heading name the truck; the body, button and "who it is from" line as worded', E.subject === 'How was your order from Pizza <Kitchen> & Co?' && E.html.includes('Thanks for ordering from Pizza &lt;Kitchen&gt; &amp; Co') && E.html.includes('would be grateful for an honest review on Google') && E.html.includes('>Leave a review on Google<') && E.html.includes('This email is from Pizza &lt;Kitchen&gt; &amp; Co, sent through HatchGrab because you ordered from them.'))
  t('the truck\'s name is escaped in the HTML (no tag injected)', !E.html.includes('<Kitchen>'))
  t('an unsubscribe link and the privacy link in the HTML; both in the plain text', E.html.includes('Don’t want review requests from') && E.html.includes(`href="https://www.hatchgrab.com/api/reviews/unsubscribe?t=${'A'.repeat(32)}"`) && /href="https:\/\/www\.hatchgrab\.com\/privacy"/.test(E.html) && E.text.includes(`Unsubscribe: https://www.hatchgrab.com/api/reviews/unsubscribe?t=${'A'.repeat(32)}`) && E.text.includes('https://www.hatchgrab.com/privacy'))
  const words = JSON.stringify(en).toLowerCase()
  t('🔴 Google\'s rule: one link to Google, and no satisfaction step — no "enjoy", "happy", "rate", "stars", "feedback" or "how did we do" in any of the words', (E.html.match(/search\.google\.com/g) || []).length === 1 && !/enjoy|happy|happi|rate us|rating|stars|feedback|how did we do|satisf/.test(words))
  const de = L.reviewEmail({ locale: 'de-DE', truckName: 'Taco Two', reviewUrl: URL_OK, unsubscribeUrl: 'https://x/u' })
  const deWords = JSON.parse(read('messages/de-DE.json')).emailReview
  t('in the order\'s language: a German order gets the German words', !!deWords && de.subject === deWords.subject.replace('{truck}', 'Taco Two') && de.html.includes('Google') && !de.html.includes('Leave a review'))
  const calls = []
  process.env.BREVO_API_KEY = 'harness-key'
  const r6 = await L.sendReviewEmail({ to: 'a@example.com', truckName: 'Pizza "Kitchen"', replyTo: 'owner@pk.test', subject: 's', html: 'h', text: 't', unsubscribeUrl: 'https://u/x' }, async (u, i) => { calls.push([u, JSON.parse(i.body)]); return { ok: true, status: 201 } })
  const b6 = calls[0]?.[1]
  t('Brevo: From "<truck> via HatchGrab" at the HatchGrab sender, Reply-To the truck, List-Unsubscribe and one-click headers', r6.sent && b6.sender.name === 'Pizza Kitchen via HatchGrab' && b6.replyTo.email === 'owner@pk.test' && b6.headers['List-Unsubscribe'] === '<https://u/x>' && b6.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click')
  delete process.env.BREVO_API_KEY
  t('no BREVO_API_KEY → not sent, no call', !(await L.sendReviewEmail({ to: 'a@b.co', truckName: 'x', replyTo: null, subject: 's', html: 'h', text: 't', unsubscribeUrl: 'u' }, async () => { throw new Error('called') })).sent)

  // ══ 7 ══
  head('7 · unsubscribe (the route, GET and one-click POST)')
  db = world({ review_requests: [{ id: 'r1', truck_id: 'test-truck-2', order_key: 'o1', email_hash: RM.emailHash('test-truck-2', 'x@example.com'), locale: 'de-DE', due_at: iso(NOW), status: 'sent', sent_at: iso(NOW), attempts: 1, unsubscribe_token: 'Z'.repeat(32), created_at: iso(NOW) }], review_request_optouts: [] })
  globalThis.__harnessDb = db
  const req = (u, m = 'GET') => new Request(u, { method: m })
  const g404 = await L.unsubGET(req('https://www.hatchgrab.com/api/reviews/unsubscribe?t=' + 'Q'.repeat(32)))
  const gBad = await L.unsubGET(req('https://www.hatchgrab.com/api/reviews/unsubscribe?t=../../etc'))
  t('an unknown or malformed token → 404, and nothing written (today every token is unknown: no request exists)', g404.status === 404 && gBad.status === 404 && db.T.review_request_optouts.length === 0)
  const g200 = await L.unsubGET(req('https://www.hatchgrab.com/api/reviews/unsubscribe?t=' + 'Z'.repeat(32)))
  const html7 = await g200.text()
  t('🔴 a real token → the opt-out recorded for that truck and customer (the hash), confirmed in the request\'s language, noindex and no-store', g200.status === 200 && db.T.review_request_optouts.length === 1 && db.T.review_request_optouts[0].email_hash === RM.emailHash('test-truck-2', 'x@example.com') && db.T.review_request_optouts[0].truck_id === 'test-truck-2'
    && html7.includes(JSON.parse(read('messages/de-DE.json')).emailReview.unsubscribed.title) && html7.includes('Taco Two') && /lang="de/.test(html7) && g200.headers.get('cache-control') === 'private, no-store' && /noindex/.test(g200.headers.get('x-robots-tag') || ''))
  const p200 = await L.unsubPOST(req('https://www.hatchgrab.com/api/reviews/unsubscribe?t=' + 'Z'.repeat(32), 'POST'))
  t('one-click POST: 200, and a second unsubscribe adds no second row', p200.status === 200 && db.T.review_request_optouts.length === 1)
  t('…and that customer is then never scheduled by that truck', await (async () => {
    db.T.orders = [order('again', { truck_id: 'test-truck-2', customer_email: 'X@example.com', status: 'ready', collected_at: null, event_id: 'ev2', country: 'DE' })]
    const r7 = await L.runReviewRequests(L.supabaseReviewStore(db), deps()); return r7.scheduled === 0 && r7.skipped.opted_out === 1
  })())

  // ══ 8 ══
  head('8 · weather: the rules')
  t('locations round to 0.01° (about 1 km)', WM.roundCoord(51.50735) === 51.51 && WM.roundCoord(-0.12776) === -0.13)
  const w1 = WM.eventWindow({ eventDate: '2026-11-06', startTime: '11:30:00', endTime: '14:00:00' }, 'Europe/London')
  const w2 = WM.eventWindow({ eventDate: '2026-07-06', startTime: '11:30', endTime: '14:00' }, 'Europe/London')
  const w3 = WM.eventWindow({ eventDate: '2026-11-06', startTime: '18:00', endTime: '01:00' }, 'Europe/Berlin')
  const w4 = WM.eventWindow({ eventDate: '2026-11-06', startTime: null, endTime: null }, 'America/New_York')
  t('the window in the truck\'s zone: GMT in November, BST in July, past midnight, and 10:00–16:00 local when the stop has no times',
    new Date(w1.startMs).toISOString() === '2026-11-06T11:30:00.000Z' && new Date(w2.startMs).toISOString() === '2026-07-06T10:30:00.000Z' && new Date(w3.endMs).toISOString() === '2026-11-07T00:00:00.000Z' && !w4.timesKnown && new Date(w4.startMs).toISOString() === '2026-11-06T15:00:00.000Z')
  const nr = (age, today) => WM.needsRefresh(iso(NOW - age), today, NOW)
  t('refresh: never fetched → yes; 23 hours old → no; 25 → yes; on the day 2 hours → no, 4 hours → yes', WM.needsRefresh(null, false, NOW) && !nr(23 * H, false) && nr(25 * H, false) && !nr(2 * H, true) && nr(4 * H, true))
  const hp = (ms, o = {}) => ({ kind: 'hour', timeUtc: iso(ms), temperatureC: 10, tempMinC: null, tempMaxC: null, precipChance: 20, windKph: 10, icon: 'cloudy', ...o })
  const base = Date.parse('2026-11-06T11:00:00Z')
  const pts = [hp(base, { temperatureC: 9 }), hp(base + H, { precipChance: 70, icon: 'rain' }), hp(base + 2 * H, { temperatureC: 12, windKph: 25, icon: 'rain' }), hp(base + 3 * H),
    { kind: 'day', timeUtc: '2026-11-08T12:00:00.000Z', temperatureC: 8, tempMinC: 4, tempMaxC: 11, precipChance: 55, windKph: 30, icon: 'drizzle' }]
  const s1 = WM.summarise(pts, w1, '2026-11-06', 'Europe/London')
  t('every hour of the window cached → hourly: min/max temperature, highest chance of rain, strongest wind, the commonest condition, the hours', s1.resolution === 'hour' && s1.tempMinC === 9 && s1.tempMaxC === 12 && s1.precipChanceMax === 70 && s1.windKphMax === 25 && s1.icon === 'rain' && s1.hours.length === 3, s1)
  const s2 = WM.summarise(pts, WM.eventWindow({ eventDate: '2026-11-08', startTime: '12:00', endTime: '15:00' }, 'Europe/London'), '2026-11-08', 'Europe/London')
  t('hours missing (beyond ~48 h) → that local day\'s forecast', s2.resolution === 'day' && s2.tempMinC === 4 && s2.tempMaxC === 11 && s2.precipChanceMax === 55 && s2.icon === 'drizzle' && s2.hours.length === 0)
  t('neither → null (unavailable)', WM.summarise(pts, WM.eventWindow({ eventDate: '2026-11-12', startTime: '12:00', endTime: '15:00' }, 'Europe/London'), '2026-11-12', 'Europe/London') === null)
  t('a tie between conditions shows the more severe', WM.iconOf(['clear', 'rain']) === 'rain' && WM.iconOf(['cloudy', 'cloudy', 'thunderstorm']) === 'cloudy' && WM.iconOf([]) === 'unknown')

  // ══ 9 ══
  head('9 · the OpenWeather provider (One Call 3.0)')
  const dt = s => Date.parse(s) / 1000
  const OW = { hourly: [{ dt: dt('2026-11-06T11:00:00Z'), temp: 9.46, pop: 0.35, wind_speed: 5, weather: [{ id: 500 }] }, { dt: 'bad' }, { dt: dt('2026-11-06T12:00:00Z'), temp: 10, pop: 1.2, wind_speed: 0, weather: [{ id: 800 }] }],
    daily: [{ dt: dt('2026-11-08T12:00:00Z'), temp: { min: 3.94, max: 11.06, day: 9 }, pop: 0.6, wind_speed: 8.3, weather: [{ id: 211 }] }] }
  const P = L.parseOneCall(OW)
  t('parsed: °C to 0.1, chance of rain in percent (capped 0–100), wind m/s → km/h, the condition id → our code; a malformed point left out',
    P.length === 3 && P[0].temperatureC === 9.5 && P[0].precipChance === 35 && P[0].windKph === 18 && P[0].icon === 'rain' && P[1].precipChance === 100 && P[1].icon === 'clear' && P[2].kind === 'day' && P[2].tempMinC === 3.9 && P[2].tempMaxC === 11.1 && P[2].icon === 'thunderstorm' && P[2].windKph === 29.9, P)
  const ICON = { 201: 'thunderstorm', 301: 'drizzle', 500: 'rain', 502: 'heavy_rain', 511: 'sleet', 601: 'snow', 612: 'sleet', 741: 'fog', 781: 'wind', 800: 'clear', 802: 'partly_cloudy', 804: 'cloudy', 999: 'unknown', x: 'unknown' }
  t('every condition group maps to a code', Object.entries(ICON).every(([id, c]) => L.iconFromOpenWeather(id === 'x' ? 'x' : Number(id)) === c))
  const owCalls = []
  const prov = L.openWeatherProvider('k-123', async (u) => { owCalls.push(String(u)); return { ok: true, status: 200, json: async () => OW } })
  const got = await prov.forecast(51.51, -0.13)
  t('one request: lat, lon, metric units, only hourly and daily, the key', owCalls.length === 1 && /onecall\?lat=51\.51&lon=-0\.13&exclude=current%2Cminutely%2Calerts&units=metric&appid=k-123$/.test(owCalls[0]) && got.length === 3, owCalls)
  const errs = []
  for (const p of [L.openWeatherProvider(undefined, async () => { throw new Error('called') }), L.openWeatherProvider('k', async () => ({ ok: false, status: 429, json: async () => ({}) })), L.openWeatherProvider('k', async () => ({ ok: true, status: 200, json: async () => ({}) }))]) {
    try { await p.forecast(1, 1) } catch (e) { errs.push(e.message) }
  }
  t('no key → throws "no_key" without a call; an HTTP error or an empty answer throws', JSON.stringify(errs) === '["no_key","openweather_429","openweather_empty"]', errs)
  t('attribution for the screen: "Weather data © OpenWeather"', prov.attribution.text === 'Weather data © OpenWeather')

  // ══ 10 ══
  head('10 · weather: caching per location and hour, refresh, fallback (the real store)')
  const WNOW = Date.parse('2026-11-06T08:00:00Z')
  const fixturePoints = () => { const out = []; for (let i = 0; i < 48; i++) out.push(hp(WNOW + i * H - (WNOW % H), { temperatureC: 8 + (i % 5), precipChance: i * 2 % 100, icon: i % 3 ? 'cloudy' : 'rain' })); for (let d = 0; d < 8; d++) out.push({ kind: 'day', timeUtc: iso(Date.parse('2026-11-06T12:00:00Z') + d * D), temperatureC: 9, tempMinC: 5, tempMaxC: 12, precipChance: 40, windKph: 20, icon: 'drizzle' }); return out }
  let fetches = 0, failNext = false
  const fakeProvider = { id: 'openweather', attribution: { text: 'Weather data © OpenWeather', url: 'https://openweathermap.org/' }, async forecast() { fetches++; if (failNext) throw new Error('openweather_503'); return fixturePoints() } }
  const wworld = () => fakeDb({
    platform_switches: [{ id: true, review_requests_enabled: false, weather_enabled: true }],
    trucks: [{ id: 'test-truck', timezone: 'Europe/London', country: 'GB', is_active: true, active: true }, { id: 'demo-x', timezone: null, country: 'GB', is_active: true, active: true }],
    venues: [{ id: 'v1', latitude: 52.2053, longitude: 0.1218 }],
    truck_events: [
      { id: 'today', truck_id: 'test-truck', event_date: '2026-11-06', start_time: '11:30:00', end_time: '14:00:00', latitude: 51.50735, longitude: -0.12776, venue_id: null, status: 'confirmed' },
      { id: 'today-same-place', truck_id: 'test-truck', event_date: '2026-11-06', start_time: '17:00:00', end_time: '20:00:00', latitude: 51.5071, longitude: -0.1281, venue_id: null, status: 'confirmed' },
      { id: 'in-3-days', truck_id: 'test-truck', event_date: '2026-11-09', start_time: '12:00:00', end_time: '15:00:00', latitude: null, longitude: null, venue_id: 'v1', status: 'unconfirmed' },
      { id: 'no-place', truck_id: 'test-truck', event_date: '2026-11-07', start_time: null, end_time: null, latitude: null, longitude: null, venue_id: null, status: 'confirmed' },
      { id: 'too-far', truck_id: 'test-truck', event_date: '2026-11-14', start_time: '12:00:00', end_time: '15:00:00', latitude: 51.5, longitude: -0.1, venue_id: null, status: 'confirmed' },
      { id: 'cancelled', truck_id: 'test-truck', event_date: '2026-11-06', start_time: '12:00:00', end_time: '15:00:00', latitude: 51.5, longitude: -0.1, venue_id: null, status: 'cancelled' },
      { id: 'over', truck_id: 'test-truck', event_date: '2026-11-06', start_time: '05:00:00', end_time: '07:00:00', latitude: 53.4, longitude: -2.2, venue_id: null, status: 'closed' },
      { id: 'demo', truck_id: 'demo-x', event_date: '2026-11-06', start_time: '12:00:00', end_time: '15:00:00', latitude: 51.5, longitude: -0.1, venue_id: null, status: 'confirmed' },
    ],
  })
  let wdb = wworld(); wdb.T.platform_switches[0].weather_enabled = false
  let wr = await L.refreshWeather(L.supabaseWeatherStore(wdb), fakeProvider, { now: () => new Date(WNOW) })
  t('🔴 weather switch OFF: nothing read beyond the switch, the provider never called, nothing stored', wr.enabled === false && fetches === 0 && JSON.stringify(wdb.calls) === '["platform_switches"]' && !(wdb.T.event_weather ?? []).length)
  wdb = wworld()
  wr = await L.refreshWeather(L.supabaseWeatherStore(wdb), fakeProvider, { now: () => new Date(WNOW) })
  const ew = id => (wdb.T.event_weather ?? []).find(r => r.event_id === id)
  t('two stops at the same place (within 0.01°) share ONE fetch; the venue\'s coordinates are used when the stop has none: 2 locations, 2 fetches', wr.locations === 2 && fetches === 2 && ew('today').lat === 51.51 && ew('today-same-place').lat === 51.51 && ew('in-3-days').lat === 52.21, wr)
  t('the cache: one row per provider, location and hour or day, with the fetch time', wdb.T.weather_hourly.length === 2 * 56 && wdb.T.weather_hourly.every(r => r.provider === 'openweather' && r.fetched_at === iso(WNOW)))
  t('today\'s stop: hourly (11:00–13:00 UTC hours), with temperature, chance of rain, wind and a code', ew('today').status === 'ok' && ew('today').resolution === 'hour' && ew('today').hours.length === 3 && ew('today').temp_max_c != null && ew('today').precip_chance_max != null && ew('today').icon && ew('today').window_start === '2026-11-06T11:30:00.000Z')
  t('in 3 days: the day\'s forecast; no location → no_location; more than 7 days → too_far; cancelled, ended and demo stops left out', ew('in-3-days').resolution === 'day' && ew('no-place').status === 'no_location' && ew('too-far').status === 'too_far' && !ew('cancelled') && !ew('over') && !ew('demo'))
  fetches = 0
  wr = await L.refreshWeather(L.supabaseWeatherStore(wdb), fakeProvider, { now: () => new Date(WNOW + 2 * H) })
  t('2 hours later: nothing fetched: on the day the cache lasts 3 hours, otherwise 24', fetches === 0)
  wr = await L.refreshWeather(L.supabaseWeatherStore(wdb), fakeProvider, { now: () => new Date(WNOW + 4 * H) })
  t('4 hours later: the location with stops today is fetched again; the other (in 3 days) is not', fetches === 1, fetches)
  fetches = 0; failNext = true
  wr = await L.refreshWeather(L.supabaseWeatherStore(wdb), fakeProvider, { now: () => new Date(WNOW + 30 * H) })
  t('🔴 the provider fails: the old forecast is kept and marked stale (never dropped)', wr.fetchFailed >= 1 && ew('in-3-days').status === 'stale' && ew('in-3-days').temp_max_c === 12)
  const empty = wworld(); empty.T.truck_events = [empty.T.truck_events[0]]
  await L.refreshWeather(L.supabaseWeatherStore(empty), fakeProvider, { now: () => new Date(WNOW) })
  t('…and with no cache at all: unavailable', (empty.T.event_weather ?? []).find(r => r.event_id === 'today').status === 'unavailable')
  failNext = false

  // ══ 11 ══
  head('11 · the routes: switched off (today) and on')
  wdb = wworld(); wdb.T.platform_switches[0].weather_enabled = false
  wdb.T.trucks[0].dashboard_token = 'tok'; wdb.T.trucks[0].operator_id = 'op'
  globalThis.__harnessDb = wdb
  const post = b => new Request('https://www.hatchgrab.com/api/manage/weather', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } })
  fetches = 0
  const wOff = await L.weatherPOST(post({ token: 'tok' }))
  t('POST /api/manage/weather while OFF → 404, nothing fetched', wOff.status === 404 && fetches === 0)
  t('…no token → 401; an unknown token → 401', (await L.weatherPOST(post({}))).status === 401 && (await L.weatherPOST(post({ token: 'nope' }))).status === 401)
  globalThis.__access = { ok: false, code: 'insufficient_permissions', status: 403 }
  t('…no access to the truck → refused before anything else', (await L.weatherPOST(post({ token: 'tok' }))).status === 403)
  delete globalThis.__access
  process.env.OPENWEATHER_API_KEY = ''
  wdb.T.platform_switches[0].weather_enabled = true
  const wOn = await L.weatherPOST(post({ token: 'tok' }))
  const body11 = await wOn.json()
  t('switched ON with no key: 200, the stops listed as unavailable (the fallback), with the attribution', wOn.status === 200 && body11.attribution.text === 'Weather data © OpenWeather' && body11.events.some(e => e.eventId === 'today' && e.status === 'unavailable'), body11)
  delete process.env.OPENWEATHER_API_KEY
  const cronReq = h => new Request('https://www.hatchgrab.com/api/cron/x', { headers: h })
  process.env.CRON_SECRET = 'cron-secret'
  t('the two jobs refuse a call without the cron secret (401)', (await L.reviewCron(cronReq({}))).status === 401 && (await L.weatherCron(cronReq({}))).status === 401)
  globalThis.__harnessDb = world({ platform_switches: [{ id: true, review_requests_enabled: false, weather_enabled: false }] })
  const rc = await (await L.reviewCron(cronReq({ authorization: 'Bearer cron-secret' }))).json()
  const wc = await (await L.weatherCron(cronReq({ authorization: 'Bearer cron-secret' }))).json()
  t('🔴 with the secret and the switches as they are live (both off): { enabled: false }, nothing scheduled, sent or fetched', rc.enabled === false && rc.sent === 0 && wc.enabled === false && JSON.stringify(globalThis.__harnessDb.calls) === '["platform_switches","platform_switches"]', [rc, wc])
  t('neither job is registered in vercel.json yet (added when the flow is agreed)', !/review-requests|cron\/weather/.test(read('vercel.json')))

  // ══ 12 ══
  head('12 · the words')
  const BASES = read('lib/i18n/locales.ts').match(/export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/)[1].match(/'([a-z]{2}-[A-Z]{2})'/g).map(x => x.slice(1, -1))
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
  const enFlat = flat(en)
  const toks = s => (String(s).match(/\{[a-z]+\}/g) || []).sort().join()
  const bad12 = BASES.filter(l => { const d = JSON.parse(read(`messages/${l}.json`)).emailReview; if (!d) return true; const f = Object.fromEntries(flat(d)); return enFlat.some(([k, v]) => !f[k] || toks(f[k]) !== toks(v) || f[k] === v && !/^(Google|HatchGrab)/.test(v)) })
  t(`en-GB and all ${BASES.length} bases: the 12 strings, the same {truck} / {url} tokens, translated`, BASES.length === 28 && enFlat.length === 12 && !bad12.length, bad12)
  const back = BASES.filter(l => { const b = JSON.parse(read(`docs/i18n/back/${l}.json`)); return enFlat.some(([k]) => !b[`emailReview.${k}`]) })
  t('every base has its back-translations', !back.length, back)
  t('en-US differs only where US English does ("anymore")', JSON.stringify(JSON.parse(read('messages/en-US.json')).emailReview) === JSON.stringify({ unsubscribed: { body: '{truck} won’t send you review requests anymore.' } }))

  // ══ 13 ══
  head('13 · nothing live touched')
  const BASE = 'bd17d482~1'
  // ⚠️ RE-PINNED (perf-1, 5 November 2026, docs/perf-1-report.md): this compared BASE with the WORKING TREE, so every later
  // workstream's files read as this one's strays (perf-1's i18n catalogues, admin routes, lib/…). It now compares BASE with this
  // work's own last commit (7bc53b81, its report) — exactly the files reviews-weather-1 changed; the untracked check is as before.
  const changed = execFileSync('git', ['diff', '--name-only', BASE, '7bc53b81'], { cwd: REPO }).toString().trim().split('\n').filter(Boolean)
  // ⚠️ RE-PINNED (site-chrome-1, 5 November 2026): untracked files are another workstream's in progress, not this work's (it is committed).
  const untracked = []
  const mine = /^(lib\/reviews\/|lib\/weather\/|app\/api\/cron\/review-requests\/|app\/api\/cron\/weather\/|app\/api\/manage\/weather\/|app\/api\/reviews\/|supabase\/migrations\/20261072_|scripts\/reviews-weather-1\.cjs$|scripts\/harnesses\.json$|scripts\/_messages-parity-1e\.cjs$|messages\/[A-Za-z-]+\.json$|messages\/ns\/[A-Za-z-]+\/emailReview\.json$|lib\/i18n\/catalog\/emailReview\.ts$|docs\/i18n\/back\/|docs\/reviews-weather-1)/
  // Other workstreams' files in the same tree (the manual, perf-1) are not this change; they are listed, not judged.
  const others = /^(docs\/reference-manual\.md|docs\/manual-v16-11-report\.md|scripts\/_perf-1-[^/]+|scripts\/perf-1[^/]*|docs\/perf-1[^/]*)$/
  const stray = [...changed, ...untracked].filter(f => !mine.test(f) && !others.test(f))
  t('every changed file is this work\'s: no page, layout, email, order route, vercel.json or proxy.ts touched', !stray.length, stray)
  // ⚠️ RE-PINNED (site-chrome-1, 5 November 2026): this work's own commits, not the tree (site-chrome-1 puts the offline line back there).
  const msgDiff = execFileSync('git', ['diff', BASE, '7bc53b81', '--', 'messages/en-GB.json'], { cwd: REPO }).toString()
  t('messages: only the new emailReview namespace added (no existing word changed)', !/^-\s+"/m.test(msgDiff) && /\+\s+"emailReview": \{/.test(msgDiff))
  const importers = execFileSync('git', ['grep', '--untracked', '-l', '-E', "@/lib/(reviews|weather)/", '--', 'app', 'lib', 'components'], { cwd: REPO }).toString().trim().split('\n').sort()
  // ⚠️ RE-PINNED (loyalty-1, 5 November 2026, docs/loyalty-1-report.md): loyalty is told to identify the customer with THIS work's salted
  // email hash (one customer key per truck across reviews and loyalty), so lib/loyalty/model.ts imports lib/reviews/model — allowed, and
  // only that file. And the byte-identical check compared BASE with the WORKING TREE, so loyalty-1's new cron in vercel.json read as this
  // work's; it now compares BASE with this work's own last commit (7bc53b81), as the changed-files check above already does.
  t('only the four new routes (and the libraries themselves) import lib/reviews or lib/weather', importers.every(f => /^(lib\/reviews\/|lib\/weather\/|app\/api\/cron\/review-requests\/|app\/api\/cron\/weather\/|app\/api\/manage\/weather\/|app\/api\/reviews\/unsubscribe\/|lib\/loyalty\/model\.ts$)/.test(f)), importers)
  t('lib/email.ts, the order and dashboard routes and every page are byte-identical to before', ['lib/email.ts', 'app/api/dashboard/action/route.ts', 'app/api/manage/route.ts', 'vercel.json', 'proxy.ts'].every(f => execFileSync('git', ['diff', '--name-only', BASE, '7bc53b81', '--', f], { cwd: REPO }).toString().trim() === ''))

  console.log(`\nreviews-weather-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
