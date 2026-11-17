#!/usr/bin/env node
if (!process.argv.includes('--yes-write-to-production')) { console.error('This script WRITES to production (through the app). Re-run with --yes-write-to-production.'); process.exit(1) }
// scripts/dev/events-overlap-livecheck.cjs — events-overlap-2's LIVE checks, through the running app (next dev on
// localhost:3000) against the shared database, on test-truck's CHECK SET only (events CL CO CD CX CS CU, made by
// events-overlap-testdata.cjs). The click-through set (A B C) is never touched.
//
//   npx -y -p pg@8.13.1 node scripts/dev/events-overlap-livecheck.cjs --yes-write-to-production [--base http://localhost:3000]
//
// Reads test-truck's dashboard token from the database itself (never printed). Every order the checks cause is added to
// the record, so scripts/dev/events-overlap-testdata-delete.cjs removes it with the rest.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS dev script */
'use strict'
const crypto = require('crypto')
const { TRUCK, die, withDb, readRecord, writeRecord } = require('./_events-overlap-db.cjs')
const SUBMIT_ONLY = process.argv.includes('--submit-only')
const BASE = (() => { const i = process.argv.indexOf('--base'); return i > 0 ? process.argv[i + 1] : 'http://localhost:3000' })()
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

async function main() {
  const rec = readRecord()
  if (!rec) die('no record — run events-overlap-testdata.cjs first')
  const id = k => { const e = rec.events.find(x => x.key === k); if (!e) die(`no event ${k} in the record`); return e }
  const CL = id('CL'), CO = id('CO'), CD = id('CD'), CX = id('CX'), CS = id('CS'), CU = id('CU')
  await withDb(async db => {
    const { rows: [tr] } = await db.query('select dashboard_token, slug from trucks where id = $1', [TRUCK])
    if (!tr?.dashboard_token) die('test-truck has no dashboard token')
    const TOKEN = tr.dashboard_token, SLUG = tr.slug
    const ev = async eid => (await db.query('select status, opened_at, closed_at, overlap_dismissed_at from truck_events where id = $1 and truck_id = $2', [eid, TRUCK])).rows[0]
    const ordersOn = async eid => (await db.query('select order_key::text, event_id::text, source, status from orders where event_id = $1 and truck_id = $2', [eid, TRUCK])).rows
    const orderByKey = async k => (await db.query('select order_key::text, event_id::text, source, truck_id from orders where order_key = $1', [k])).rows[0]
    const post = async (path, body) => {
      const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      let j = null; try { j = await r.json() } catch { /* not json */ }
      return { status: r.status, body: j || {} }
    }
    const evAct = (action, eventId, payload = {}) => post('/api/events/action', { token: TOKEN, action, eventId, payload })
    const walkup = (e, extra = {}) => {
      const order_key = crypto.randomUUID()
      return post('/api/dashboard/action', { token: TOKEN, pin: '', action: 'manual', ...extra,
        manualOrder: { customerName: 'EO2 check walk-up', slot: '12:30', event_date: e.event_date, event_id: e.id, order_key,
          items: [{ name: 'Campagnola', quantity: 1, unit_price: 12, modifiers: [] }] } }).then(r => ({ ...r, order_key }))
    }
    // customerEmail: a reserved .test address (RFC 2606) — it can never be delivered. Submit requires an email for a real truck.
    const submit = (eventDate, eventId) => post('/api/orders/submit', { truckId: SLUG, customerName: 'EO2 check online', customerPhone: '07700900000', customerEmail: 'eo2-check@example.test',
      slot: '12:30', eventDate, ...(eventId ? { eventId } : {}), items: [{ name: 'Campagnola', quantity: 1, unit_price: 12, modifiers: [] }], deals: [] })

    if (SUBMIT_ONLY) { await submitAfterFirstRun(); return finish() }
    head('1 · /api/events/action open / close — an error with the current status, never a silent ok')
    let r = await evAct('open', CD.id)
    t('open on UNCONFIRMED (CD) → 409 event_cannot_start "not approved"', r.status === 409 && r.body.code === 'event_cannot_start' && r.body.status === 'unconfirmed', JSON.stringify(r))
    t('…CD unchanged in the database', (await ev(CD.id)).status === 'unconfirmed' && !(await ev(CD.id)).opened_at)
    r = await evAct('close', CS.id)
    t('close on CONFIRMED, not started (CS) → 409 event_cannot_finish "not started"', r.status === 409 && r.body.code === 'event_cannot_finish' && r.body.status === 'confirmed', JSON.stringify(r))
    r = await evAct('open', CS.id)
    t('open on CONFIRMED (CS) → 200, now open with opened_at', r.status === 200 && (await ev(CS.id)).status === 'open' && !!(await ev(CS.id)).opened_at, JSON.stringify(r))
    r = await evAct('open', CS.id)
    t('open again → 409 "already started"', r.status === 409 && r.body.status === 'open', JSON.stringify(r))
    r = await evAct('close', CS.id)
    t('close the OPEN event → 200, now closed', r.status === 200 && (await ev(CS.id)).status === 'closed', JSON.stringify(r))
    r = await evAct('close', CS.id)
    t('close again → 409 "already finished"', r.status === 409 && r.body.status === 'closed', JSON.stringify(r))
    r = await evAct('open', CX.id)
    t('open on CANCELLED (CX) → 409, status cancelled', r.status === 409 && r.body.status === 'cancelled', JSON.stringify(r))

    head('2 · walk-ups (action manual) — confirmed / open / closed yes; unconfirmed / cancelled no')
    r = await walkup(CD)
    t('walk-up on UNCONFIRMED (CD) → 409 event_not_approved "This event isn’t approved"', r.status === 409 && r.body.code === 'event_not_approved' && r.body.error === 'This event isn’t approved', JSON.stringify(r.body))
    t('…nothing inserted (order_key absent)', !(await orderByKey(r.order_key)))
    r = await walkup(CX)
    t('walk-up on CANCELLED (CX) → 409 event_not_open', r.status === 409 && r.body.code === 'event_not_open', JSON.stringify(r.body))
    t('…nothing inserted', !(await orderByKey(r.order_key)))
    r = await walkup(CL)
    const w1 = await orderByKey(r.order_key)
    t('walk-up on CONFIRMED (CL) → 200 and on CL', r.status === 200 && w1?.event_id === CL.id && w1?.source === 'manual', JSON.stringify(r.body).slice(0, 200))
    r = await walkup(CS)
    const w2 = await orderByKey(r.order_key)
    t('walk-up on CLOSED (CS) → 200 and on CS (Q5 → B, as before)', r.status === 200 && w2?.event_id === CS.id, JSON.stringify(r.body).slice(0, 200))

    head('3 · offline replay (placed_offline) — moved onto the overlapping approved event; kept queued when none')
    r = await walkup(CD, { placed_offline: true })
    const rp = await orderByKey(r.order_key)
    t('replay for UNCONFIRMED CD → 200, the order is on CL (overlaps CD, most orders: CL 2 vs CO 0)', r.status === 200 && rp?.event_id === CL.id, JSON.stringify({ status: r.status, event: rp?.event_id, body: r.body }).slice(0, 300))
    t('…nothing on CD', (await ordersOn(CD.id)).length === 0)
    r = await walkup(CU, { placed_offline: true })
    t('replay for UNCONFIRMED CU, nothing overlaps → 409 event_not_approved with keep_queued: true', r.status === 409 && r.body.code === 'event_not_approved' && r.body.keep_queued === true, JSON.stringify(r.body))
    t('…nothing inserted', !(await orderByKey(r.order_key)))
    r = await walkup(CX, { placed_offline: true })
    t('replay for CANCELLED CX → 409 without keep_queued (the outbox flags a conflict)', r.status === 409 && r.body.keep_queued === undefined, JSON.stringify(r.body))

    head('4 · customer submit (Q3) — never on an unconfirmed or cancelled event; two matching is never a refusal')
    const placedOn = async res => (res.body?.order_key ? (await orderByKey(res.body.order_key))?.event_id : null) ?? (res.body?.orderKey ? (await orderByKey(res.body.orderKey))?.event_id : null)
    const showRes = res => JSON.stringify({ status: res.status, code: res.body?.code, error: res.body?.error, keys: Object.keys(res.body || {}).slice(0, 12) })
    r = await submit(CL.event_date, CL.id)
    t('eventId = CONFIRMED CL → 200, on CL', r.status === 200 && await placedOn(r) === CL.id, showRes(r))
    r = await submit(CD.event_date, CD.id)
    t('eventId = UNCONFIRMED CD → 200, on CL (the confirmed one with the most orders), never CD', r.status === 200 && await placedOn(r) === CL.id, showRes(r))
    r = await submit(CL.event_date, null)
    t('no eventId, CL and CO both confirmed → 200 on CL (most orders), not refused', r.status === 200 && await placedOn(r) === CL.id, showRes(r))
    r = await submit(CX.event_date, CX.id)
    t('eventId = CANCELLED CX → 200, on CL', r.status === 200 && await placedOn(r) === CL.id, showRes(r))
    r = await submit(CU.event_date, CU.id)
    t('eventId = UNCONFIRMED CU, nothing confirmed/open that date → 403 event_not_available (the existing message)', r.status === 403 && r.body.code === 'event_not_available', showRes(r))
    r = await evAct('open', CO.id)
    t('(open CO, 0 orders)', r.status === 200)
    r = await submit(CO.event_date, null)
    t('no eventId, OPEN CO (0 orders) + busier CONFIRMED CL → 200 on CO (open first)', r.status === 200 && await placedOn(r) === CO.id, showRes(r))
    t('…still nothing on CD or CX', (await ordersOn(CD.id)).length === 0 && (await ordersOn(CX.id)).length === 0)

    head('5 · "Keep {other}" — overlap_dismissed_at persists once (the column exists)')
    r = await evAct('dismiss_overlap', CD.id)
    const at1 = (await ev(CD.id)).overlap_dismissed_at
    t('dismiss_overlap on CD → 200, overlap_dismissed_at set in the database', r.status === 200 && !!at1, JSON.stringify(r))
    r = await evAct('dismiss_overlap', CD.id)
    const at2 = (await ev(CD.id)).overlap_dismissed_at
    t('again → 200, the stored time is unchanged', r.status === 200 && String(at1) === String(at2), `${at1} vs ${at2}`)
    t('CD is still unconfirmed', (await ev(CD.id)).status === 'unconfirmed')
    r = await evAct('dismiss_overlap', CL.id)
    t('dismiss on an APPROVED event (CL) → 409 event_cannot_dismiss', r.status === 409 && r.body.code === 'event_cannot_dismiss', JSON.stringify(r))
    const evs = await db.query('select count(*)::int n from truck_events where overlap_dismissed_at is not null and truck_id <> $1', [TRUCK])
    t('no other truck has the column set', evs.rows[0].n === 0, JSON.stringify(evs.rows[0]))

    return finish()

    // ── --submit-only: section 4 again after a first full run left CO OPEN (an event cannot go back to confirmed) ──
    async function submitAfterFirstRun() {
      head('4 (re-run) · customer submit (Q3) — CO is OPEN (0 orders), CL CONFIRMED (busier), CD unconfirmed, CX cancelled')
      const placedOn = async res => (res.body?.order_key ? (await orderByKey(res.body.order_key))?.event_id : null) ?? (res.body?.orderKey ? (await orderByKey(res.body.orderKey))?.event_id : null)
      const showRes = res => JSON.stringify({ status: res.status, code: res.body?.code, error: res.body?.error, keys: Object.keys(res.body || {}).slice(0, 12) })
      t('(state) CO is open, CL confirmed', (await ev(CO.id)).status === 'open' && (await ev(CL.id)).status === 'confirmed')
      let q = await submit(CL.event_date, CL.id)
      t('eventId = CONFIRMED CL → 200, on CL (the event the customer ordered from)', q.status === 200 && await placedOn(q) === CL.id, showRes(q))
      q = await submit(CL.event_date, null)
      t('no eventId, OPEN CO (0 orders) + busier CONFIRMED CL → 200 on CO (open first), not refused', q.status === 200 && await placedOn(q) === CO.id, showRes(q))
      q = await submit(CD.event_date, CD.id)
      t('eventId = UNCONFIRMED CD → 200 on CO (open first), never CD', q.status === 200 && await placedOn(q) === CO.id, showRes(q))
      q = await submit(CX.event_date, CX.id)
      t('eventId = CANCELLED CX → 200 on CO, never CX', q.status === 200 && await placedOn(q) === CO.id, showRes(q))
      q = await evAct('close', CO.id)
      t('(finish CO)', q.status === 200)
      q = await submit(CD.event_date, CD.id)
      t('CO now CLOSED: eventId = CD → 200 on CL (closed is never chosen for a customer)', q.status === 200 && await placedOn(q) === CL.id, showRes(q))
      q = await submit(CU.event_date, CU.id)
      t('eventId = UNCONFIRMED CU, nothing confirmed/open that date → 403 event_not_available (the existing message)', q.status === 403 && q.body.code === 'event_not_available', showRes(q))
      t('…nothing on CD, CX or CU', (await ordersOn(CD.id)).length === 0 && (await ordersOn(CX.id)).length === 0 && (await ordersOn(CU.id)).length === 0)
    }

    async function finish() {
    // record every order the checks caused on the check set (test-truck only)
    const checkIds = rec.events.filter(e => e.set === 'check').map(e => e.id)
    const known = new Set(rec.orders.map(o => o.order_key))
    const { rows: made } = await db.query('select order_key::text, event_id::text, id, customer_name, status, source, truck_id from orders where event_id = any($1::uuid[]) order by created_at', [checkIds])
    let added = 0
    for (const o of made) if (!known.has(o.order_key)) {
      if (o.truck_id !== TRUCK) die(`an order of another truck on a check event: ${o.order_key}`)
      rec.orders.push({ order_key: o.order_key, event_key: rec.events.find(e => e.id === o.event_id)?.key ?? '?', number: o.id, customer: o.customer_name, status: o.status, source: `livecheck (${o.source})` })
      added++
    }
    writeRecord(rec)
    console.log(`\n${added} order(s) made by the checks added to the record (${rec.orders.length} orders, ${rec.events.length} events recorded).`)
    }
  }, 'events-overlap-livecheck (Claude Code)')
  console.log(`\n${fail ? '✗' : '✓'} events-overlap-livecheck: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main()
