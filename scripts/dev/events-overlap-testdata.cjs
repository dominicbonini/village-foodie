#!/usr/bin/env node
if (!process.argv.includes('--yes-write-to-production')) { console.error('This script WRITES to production. Re-run with --yes-write-to-production.'); process.exit(1) }
// scripts/dev/events-overlap-testdata.cjs — ONE-OFF TEST DATA FOR events-overlap-2, ON test-truck (Pizza Kitchen) ONLY.
//
//   npx -y -p pg@8.13.1 node scripts/dev/events-overlap-testdata.cjs --yes-write-to-production
//
// Creates, in ONE transaction, and records every id in scripts/dev/events-overlap-testdata.local.json (git-ignored):
//   CLICK-THROUGH SET (today, London) — for Dominic on localhost; nothing in the scripts changes it afterwards:
//     A  "Harnessville Sports Club" CONFIRMED 12:00–23:00, Van1, never started (auto_open off), 3 online orders + 1 cancelled
//     B  "HSC"                      UNCONFIRMED duplicate, same times, no van, source scraper
//     C  "Market Square"            CONFIRMED tomorrow 11:30–14:00, Van1 — no overlap
//     D  "Harnessville SC"          UNCONFIRMED, same times as A, no van — a second duplicate, for "Approve anyway"
//        (added 17 Nov with --append, so "Keep" can be tried on B and "Approve anyway" on D)
//   CHECK SET (+2 days and +3 days) — used only by scripts/dev/events-overlap-livecheck.cjs:
//     CL confirmed 12:00–20:00 + 1 online order · CO confirmed same times, no orders · CD unconfirmed same times
//     CX cancelled same times · CS confirmed 21:00–23:00 (open/close checks) · CU unconfirmed on +3 days, alone
// 🔴 It refuses if a record already exists (delete first, or the rows would be orphaned from the record).
// Undo: scripts/dev/events-overlap-testdata-delete.cjs (deletes exactly the recorded ids, test-truck only).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS dev script */
'use strict'
const { TRUCK, RECORD, die, withDb, show, readRecord, writeRecord } = require('./_events-overlap-db.cjs')

const EVENTS = [
  // key, day offset, venue, postcode, start, end, status, source, van?, orders [name, status, slot]
  { key: 'A', set: 'click', day: 0, venue: 'Harnessville Sports Club', pc: 'CB8 8QX', start: '12:00', end: '23:00', status: 'confirmed', source: 'manual', van: true,
    orders: [['Amy', 'confirmed', '12:30'], ['Ben', 'confirmed', '13:00'], ['Cara', 'collected', '12:15'], ['Dan', 'cancelled', '12:45']] },
  { key: 'B', set: 'click', day: 0, venue: 'HSC', pc: 'CB8 8YX', start: '12:00', end: '23:00', status: 'unconfirmed', source: 'scraper', van: false, orders: [] },
  { key: 'D', set: 'click', day: 0, venue: 'Harnessville SC', pc: 'CB8 8ZZ', start: '12:00', end: '23:00', status: 'unconfirmed', source: 'scraper', van: false, orders: [], appendOnly: true },
  { key: 'C', set: 'click', day: 1, venue: 'Market Square', pc: 'CB9 1AA', start: '11:30', end: '14:00', status: 'confirmed', source: 'manual', van: true, orders: [] },
  { key: 'CL', set: 'check', day: 2, venue: 'EO2 check Live', pc: 'CB8 7AA', start: '12:00', end: '20:00', status: 'confirmed', source: 'manual', van: true, orders: [['Check One', 'confirmed', '12:30']] },
  { key: 'CO', set: 'check', day: 2, venue: 'EO2 check Other', pc: 'CB8 7BB', start: '12:00', end: '20:00', status: 'confirmed', source: 'manual', van: true, orders: [] },
  { key: 'CD', set: 'check', day: 2, venue: 'EO2 check Dup', pc: 'CB8 7CC', start: '12:00', end: '20:00', status: 'unconfirmed', source: 'scraper', van: false, orders: [] },
  { key: 'CX', set: 'check', day: 2, venue: 'EO2 check Cancelled', pc: 'CB8 7DD', start: '12:00', end: '20:00', status: 'cancelled', source: 'manual', van: true, orders: [] },
  { key: 'CS', set: 'check', day: 2, venue: 'EO2 check Start', pc: 'CB8 7EE', start: '21:00', end: '23:00', status: 'confirmed', source: 'manual', van: true, orders: [] },
  { key: 'CU', set: 'check', day: 3, venue: 'EO2 check Lone', pc: 'CB8 7FF', start: '12:00', end: '20:00', status: 'unconfirmed', source: 'scraper', van: false, orders: [] },
]
const ITEM = { name: 'Campagnola', price: 12 }   // a dish on Pizza Kitchen's menu

// --append: create only the events the record does not have yet (D, added for the "Approve anyway" step), into the same record.
const APPEND = process.argv.includes('--append')
async function main() {
  const existing = readRecord()
  if (existing && !APPEND) die(`a record already exists (${RECORD}) — run the delete script first (or --append)`)
  if (!existing && APPEND) die('--append needs an existing record')
  await withDb(async c => {
    await c.query('begin')
    const SQL_TRUCK = `select id, (now() at time zone 'Europe/London')::date as today,
  (select id from truck_vans where truck_id = $1 and active order by created_at limit 1) as van_id
from trucks where id = $1`
    show(SQL_TRUCK, [TRUCK])
    const { rows: [t] } = await c.query(SQL_TRUCK, [TRUCK])
    if (!t || t.id !== TRUCK) throw new Error('test-truck not found')
    const record = existing || { created_at: new Date().toISOString(), truck_id: TRUCK, events: [], orders: [] }
    const have = new Set(record.events.map(e => e.key))
    const SQL_EVENT = `insert into truck_events (truck_id, venue_name, town, postcode, event_date, start_time, end_time, status, source, van_id,
  auto_open, auto_close, confirmed_at, scraped_signature, order_counter, notes)
values ($1, $2, 'Harnessville', $3, ((now() at time zone 'Europe/London')::date + $4::int), $5::time, $6::time, $7, $8, $9,
  false, true, case when $7 in ('confirmed', 'cancelled') then now() end, case when $8 = 'scraper' then $2 end, $10, 'events-overlap-2 test data')
returning id, truck_id, event_date, status`
    const SQL_ORDER = `insert into orders (id, truck_id, event_id, event_date, customer_name, items, subtotal, total, total_minor, currency, country,
  status, source, slot, van_id, payment_status, notes)
values ($1, $2, $3, $4, $5, $6::jsonb, $7, $7, $8, 'GBP', 'GB', $9, 'web', $10, $11, 'unpaid', 'events-overlap-2 test data')
returning order_key, truck_id, event_id`
    show(SQL_EVENT); show(SQL_ORDER)
    for (const e of EVENTS) {
      if (have.has(e.key)) continue
      const { rows: [ev] } = await c.query(SQL_EVENT, [TRUCK, e.venue, e.pc, e.day, e.start, e.end, e.status, e.source, e.van ? t.van_id : null, e.orders.length])
      if (ev.truck_id !== TRUCK) throw new Error('an event landed on another truck')
      record.events.push({ id: ev.id, key: e.key, set: e.set, venue: e.venue, event_date: String(ev.event_date instanceof Date ? ev.event_date.toISOString().slice(0, 10) : ev.event_date), status: e.status })
      let n = 0
      for (const [name, status, slot] of e.orders) {
        n++
        const items = JSON.stringify([{ name: ITEM.name, quantity: 1, unit_price: ITEM.price, modifiers: [] }])
        const { rows: [o] } = await c.query(SQL_ORDER, [String(n), TRUCK, ev.id, ev.event_date, name, items, ITEM.price, ITEM.price * 100, status, slot, e.van ? t.van_id : null])
        if (o.truck_id !== TRUCK) throw new Error('an order landed on another truck')
        record.orders.push({ order_key: o.order_key, event_key: e.key, number: n, customer: name, status, source: 'test-data' })
      }
    }
    await c.query('commit')
    writeRecord(record)
    console.log(`\n${APPEND ? 'appended to' : 'created on'} ${TRUCK}: now ${record.events.length} events, ${record.orders.length} orders — recorded in ${RECORD}`)
    for (const e of record.events) console.log(`  ${e.key.padEnd(2)} ${e.event_date} ${e.status.padEnd(11)} ${e.venue}  ${e.id}`)
  }, 'events-overlap-testdata (Claude Code)')
}
main()
