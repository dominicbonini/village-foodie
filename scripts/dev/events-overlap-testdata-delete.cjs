#!/usr/bin/env node
if (!process.argv.includes('--yes-write-to-production')) { console.error('This script WRITES to production. Re-run with --yes-write-to-production.'); process.exit(1) }
// scripts/dev/events-overlap-testdata-delete.cjs — DELETES EXACTLY THE ROWS RECORDED BY events-overlap-testdata.cjs, NOTHING ELSE.
//
//   npx -y -p pg@8.13.1 node scripts/dev/events-overlap-testdata-delete.cjs --yes-write-to-production --rescan
//        read-only: lists test-truck orders that now sit on the recorded events but are NOT in the record (e.g. walk-ups
//        placed during the click-through) and ADDS them to the record, so the delete can take them too. Deletes nothing.
//   npx -y -p pg@8.13.1 node scripts/dev/events-overlap-testdata-delete.cjs --yes-write-to-production --dry-run
//        read-only: what the delete would remove.
//   npx -y -p pg@8.13.1 node scripts/dev/events-overlap-testdata-delete.cjs --yes-write-to-production --approved-by-dominic
//        the delete, in ONE transaction: the recorded orders, then the recorded events (their slot-usage, deal, stock and
//        weather rows go with them by ON DELETE CASCADE). The record file is removed only after the commit.
// 🔴 REFUSES (and changes nothing) when: the flag is missing; any recorded event or order belongs to a truck other than
// test-truck; an order NOT in the record sits on a recorded event (run --rescan first); or the delete would remove a
// different number of rows than the record lists.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS dev script */
'use strict'
const fs = require('fs')
const { TRUCK, RECORD, die, withDb, show, readRecord, writeRecord } = require('./_events-overlap-db.cjs')
const args = process.argv.slice(2)
const RESCAN = args.includes('--rescan'), DRY = args.includes('--dry-run'), APPROVED = args.includes('--approved-by-dominic')

async function main() {
  const rec = readRecord()
  if (!rec) die(`no record at ${RECORD} — nothing to delete`)
  if (rec.truck_id !== TRUCK) die(`the record names truck ${rec.truck_id}, not ${TRUCK}`)
  if (!RESCAN && !DRY && !APPROVED) die('the delete needs --approved-by-dominic (or use --dry-run / --rescan)')
  const eventIds = rec.events.map(e => e.id)
  const orderKeys = rec.orders.map(o => o.order_key)
  await withDb(async c => {
    await c.query('begin')
    // 1. every recorded row must be test-truck's
    const SQL_OWN = `select 'event' as kind, id::text as id, truck_id from truck_events where id = any($1::uuid[]) and truck_id <> $3
union all
select 'order', order_key::text, truck_id from orders where order_key = any($2::uuid[]) and truck_id <> $3`
    show(SQL_OWN, [eventIds, orderKeys, TRUCK])
    const { rows: foreign } = await c.query(SQL_OWN, [eventIds, orderKeys, TRUCK])
    if (foreign.length) { await c.query('rollback'); die(`REFUSED — ${foreign.length} recorded row(s) belong to another truck: ${JSON.stringify(foreign)}`) }
    // 2. orders on the recorded events that the record does not list
    const SQL_EXTRA = `select order_key::text, truck_id, event_id::text, id, customer_name, status, source, created_at
from orders where event_id = any($1::uuid[]) and not (order_key = any($2::uuid[])) order by created_at`
    show(SQL_EXTRA, [eventIds, orderKeys])
    const { rows: extra } = await c.query(SQL_EXTRA, [eventIds, orderKeys])
    if (RESCAN) {
      await c.query('rollback')
      const bad = extra.filter(o => o.truck_id !== TRUCK)
      if (bad.length) die(`REFUSED — orders of another truck sit on a recorded event: ${JSON.stringify(bad)}`)
      for (const o of extra) rec.orders.push({ order_key: o.order_key, event_key: rec.events.find(e => e.id === o.event_id)?.key ?? '?', number: o.id, customer: o.customer_name, status: o.status, source: `rescan (${o.source})` })
      if (extra.length) writeRecord(rec)
      console.log(`\nrescan: ${extra.length} order(s) added to the record${extra.length ? ':' : '.'}`)
      for (const o of extra) console.log(`  #${o.id} ${o.customer_name} (${o.source}, ${o.status}) on ${o.event_id}`)
      return
    }
    if (extra.length) { await c.query('rollback'); die(`REFUSED — ${extra.length} order(s) on recorded events are not in the record (run --rescan first): ${extra.map(o => `#${o.id} ${o.customer_name}`).join(', ')}`) }
    if (DRY) {
      await c.query('rollback')
      console.log(`\ndry run: would delete ${orderKeys.length} orders and ${eventIds.length} events on ${TRUCK}.`)
      return
    }
    // 3. the delete — exactly the recorded rows, test-truck only, counts checked before commit
    const SQL_DEL_ORDERS = `delete from orders where order_key = any($1::uuid[]) and truck_id = $2 returning order_key`
    const SQL_DEL_EVENTS = `delete from truck_events where id = any($1::uuid[]) and truck_id = $2 returning id`
    show(SQL_DEL_ORDERS, [orderKeys, TRUCK]); show(SQL_DEL_EVENTS, [eventIds, TRUCK])
    const o = await c.query(SQL_DEL_ORDERS, [orderKeys, TRUCK])
    const e = await c.query(SQL_DEL_EVENTS, [eventIds, TRUCK])
    if (o.rowCount !== orderKeys.length || e.rowCount !== eventIds.length) {
      await c.query('rollback')
      die(`REFUSED — would delete ${o.rowCount}/${orderKeys.length} orders and ${e.rowCount}/${eventIds.length} events; rolled back`)
    }
    await c.query('commit')
    fs.renameSync(RECORD, RECORD.replace(/\.local\.json$/, `.deleted-${Date.now()}.local.json`))
    console.log(`\ndeleted on ${TRUCK}: ${o.rowCount} orders, ${e.rowCount} events. Record moved aside.`)
  }, 'events-overlap-testdata-delete (Claude Code)')
}
main()
