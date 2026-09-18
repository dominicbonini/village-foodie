#!/usr/bin/env node
// scripts/sixteen-pizza-admission.cjs — a manual (or edited) order is admitted against the board WITHOUT
// its own load, and the breach banner names the real limit.
//   node scripts/sixteen-pizza-admission.cjs
//
// 🔴 FAILURE MODE (Dominic, test-truck, "Rolling batch test", switch ON, Pizza prep 15 / batch 8, kc NULL):
// 16 Margheritas @20:30 added in Add Order — both cooking windows empty, the list showed 20:30 free, the
// fresh re-check found it fit, no popup — and the order saved as #9 with cooking_reservation
// { source: 'override', windows: [20:15–20:30: 16] }, the strip red "! 16 Pizzas", the banner "Kitchen over
// capacity … Placed anyway: #9". Cause: the manual path REBUILDS production_slot_usage (now holding #9's 16)
// and then admitForManual read those totals as "existing" — two full batches that were the order's own —
// refused it, and stored the override. The real admitForManual runs here against an in-memory PostgREST.
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { installMocks } = require('./_printing-mocks.cjs')
let fails = 0
const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const winStr = rec => rec ? rec.cats.pizza.windows.map(w => `${fmt(w.startMins)}–${fmt(w.endMins)}:${w.items}`).join(' ') : '(null)'

// ── an in-memory PostgREST: from(table).select().eq().neq().in().not().is().order().limit().maybeSingle()/single() ──
function fakeClient(tables) {
  const builder = (table) => {
    const f = []; let one = null
    const q = {
      select() { return q }, order() { return q }, limit() { return q },
      eq(k, v) { f.push(r => r[k] === v); return q }, neq(k, v) { f.push(r => r[k] !== v); return q },
      in(k, vs) { f.push(r => vs.includes(r[k])); return q }, is(k, v) { f.push(r => r[k] === v); return q },
      not(k, op, v) { if (op === 'is' && v === null) f.push(r => r[k] !== null && r[k] !== undefined); return q },
      maybeSingle() { one = 'maybe'; return q }, single() { one = 'single'; return q },
      then(res, rej) { const rows = (tables[table] || []).filter(r => f.every(p => p(r))).map(r => ({ ...r }))
        if (one) return Promise.resolve({ data: rows[0] ?? null, error: one === 'single' && !rows.length ? { code: 'PGRST116', message: 'no rows' } : null }).then(res, rej)
        return Promise.resolve({ data: rows, error: null }).then(res, rej) },
    }
    return q
  }
  return { from: (t) => builder(t) }
}
// ── DOMINIC'S EVENT, AS THE DATABASE HELD IT (read-only SQL, 19 September 2026) ─────────────────────
const EVENT = '7a98c341-85b3-43ab-856f-073a9ffe982b', VAN = '8e38901e-113f-42fc-ac60-11cf1360212b', TRUCK = 'test-truck'
const order = (id, slot, n, status, key, extra = {}) => ({ id, order_key: key, truck_id: TRUCK, event_id: EVENT, slot, status, items: [{ name: 'Buscaiola', quantity: n }], deals: null, cooking_reservation: null, ...extra })
function seed() {
  return {
    truck_events: [{ id: EVENT, truck_id: TRUCK, event_date: '2026-09-17', start_time: '17:00:00', end_time: '21:00:00', van_id: VAN }],
    truck_vans: [{ id: VAN, truck_id: TRUCK, kitchen_capacity: null, capacity_window_mins: 10 }],
    menu_categories: [{ id: 'c-pizza', truck_id: TRUCK, name: 'Pizza', prep_secs: 900, batch_size: 8, counts_toward_capacity: true }, { id: 'c-des', truck_id: TRUCK, name: 'Desserts', prep_secs: 0, batch_size: 0, counts_toward_capacity: false }],
    menu_items_db: [{ truck_id: TRUCK, name: 'Buscaiola', category_id: 'c-pizza' }, { truck_id: TRUCK, name: 'Margherita', category_id: 'c-pizza' }],
    collection_times: [],
    orders: [order(3, '18:15', 8, 'pending', 'k3'), order(4, '18:30', 8, 'ready', 'k4'), order(5, '19:00', 8, 'confirmed', 'k5'), order(6, '19:15', 8, 'pending', 'k6'), order(7, '17:15', 9, 'confirmed', 'k7'),
      order(8, '17:30', 7, 'collected', 'k8', { cooking_reservation: { v: 1, source: 'fit', slot: '17:30', computed: {}, cats: { pizza: { items: 7, batch: 8, prepMins: 15, windows: [{ startMins: 1035, endMins: 1050, items: 7 }] } } } })],
    production_slot_usage: [],
  }
}
/** The manual path, as it runs: insert #9, then rebuild production_slot_usage from the orders (INCLUDING #9). */
function afterManualInsert(t) {
  t.orders.push(order(9, '20:30', 16, 'confirmed', 'k9'))
  const occ = new Set(['pending', 'confirmed', 'modified', 'cooking']); const totals = {}
  for (const o of t.orders) if (occ.has(o.status)) { totals[o.slot] = totals[o.slot] || {}; for (const it of o.items) totals[o.slot].pizza = (totals[o.slot].pizza || 0) + it.quantity }
  t.production_slot_usage = Object.entries(totals).map(([production_slot, units_by_cat]) => ({ truck_id: TRUCK, event_id: EVENT, event_date: '2026-09-17', production_slot, units_by_cat }))
  return t
}
const LINES = [{ name: 'Buscaiola', quantity: 16 }], ITEM_CAT = { Buscaiola: 'pizza', Margherita: 'pizza' }
function admission(tree) { const R = tree.req('lib/orders/cooking-reservation.js'); return async (t) => R.admitForManual(fakeClient(t), TRUCK, EVENT, '2026-09-17', 'k9', '20:30', LINES, ITEM_CAT) }
const FILES = ['lib/orders/cooking-reservation.ts']

;(async () => {
  console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
  {
    // V1 — admitForManual as it was: the board read from the stored totals, own load included.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sixteen-v1-'))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
    const f = path.join(tmp, 'lib/orders/cooking-reservation.ts'); const src = fs.readFileSync(f, 'utf8')
    const from = '      readUnitsWithoutOrder(supabase, truckId, eventId, orderKey),', to = '      getProductionSlotUnits(supabase, truckId, eventId, orderKey),'
    if (src.split(from).length !== 2) { console.log('🔴 V1 anchor not found'); process.exit(1) }
    fs.writeFileSync(f, src.replace(from, to).replace("import { buildItemCatMap, normaliseOrderLines, readCookingReservations, readUnitsWithoutOrder }", "import { buildItemCatMap, normaliseOrderLines, getProductionSlotUnits, readCookingReservations, readUnitsWithoutOrder }"))
    const rec = await admission(compile(tmp, FILES, 'sixteenV1'))(afterManualInsert(seed()))
    const bad = rec && rec.source === 'override' && rec.cats.pizza.windows.length === 1 && rec.cats.pizza.windows[0].items === 16
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 the stored totals read as existing: source=${rec && rec.source} windows=${winStr(rec)} — Dominic's #9, exactly`)
    fs.rmSync(tmp, { recursive: true, force: true }); if (!bad) process.exit(1)
  }
  const tree = compile(REPO, FILES, 'sixteen')
  const admit = admission(tree)

  console.log("\n── DOMINIC'S SEQUENCE THROUGH THE REAL admitForManual ────────────────────────────────────")
  { const rec = await admit(afterManualInsert(seed()))
    check(rec && rec.source === 'fit', `manual: 16 @20:30 after the insert + rebuild → source ${rec && rec.source}`)
    check(rec && rec.cats.pizza.windows.length === 2 && winStr(rec) === '20:00–20:15:8 20:15–20:30:8', `…two windows of 8: ${winStr(rec)} (both were empty)`) }
  { // the edit path: an existing 8 @18:30 (#4, ready → not occupying) edited to 16 @20:30 — the re-book has already put the new lines on the board.
    const t = seed(); t.orders = t.orders.map(o => o.id === 4 ? { ...o, status: 'confirmed', slot: '20:30', items: [{ name: 'Buscaiola', quantity: 16 }] } : o)
    const occ = new Set(['pending', 'confirmed', 'modified', 'cooking']); const totals = {}
    for (const o of t.orders) if (occ.has(o.status)) { totals[o.slot] = totals[o.slot] || {}; for (const it of o.items) totals[o.slot].pizza = (totals[o.slot].pizza || 0) + it.quantity }
    t.production_slot_usage = Object.entries(totals).map(([production_slot, units_by_cat]) => ({ truck_id: TRUCK, event_id: EVENT, event_date: '2026-09-17', production_slot, units_by_cat }))
    const R = tree.req('lib/orders/cooking-reservation.js')
    const rec = await R.admitForManual(fakeClient(t), TRUCK, EVENT, '2026-09-17', 'k4', '20:30', LINES, ITEM_CAT)
    check(rec && rec.source === 'fit' && winStr(rec) === '20:00–20:15:8 20:15–20:30:8', `edit: re-booked then admitted → source ${rec && rec.source}, ${winStr(rec)}`) }
  { // and a GENUINE over-batch still records an override: 16 @20:30 when 20:00–20:15 already holds another order's 8
    const t = afterManualInsert(seed()); t.orders.push(order(10, '20:15', 8, 'confirmed', 'k10'))
    const occ = new Set(['pending', 'confirmed', 'modified', 'cooking']); const totals = {}
    for (const o of t.orders) if (occ.has(o.status)) { totals[o.slot] = totals[o.slot] || {}; for (const it of o.items) totals[o.slot].pizza = (totals[o.slot].pizza || 0) + it.quantity }
    t.production_slot_usage = Object.entries(totals).map(([production_slot, units_by_cat]) => ({ truck_id: TRUCK, event_id: EVENT, event_date: '2026-09-17', production_slot, units_by_cat }))
    const rec = await admit(t)
    check(rec && rec.source === 'override' && winStr(rec) === '20:15–20:30:16', `a real over-batch (another 8 in 20:00–20:15): source ${rec && rec.source}, ${winStr(rec)} — Place it anyway still records the shortfall`) }

  console.log('\n── THE BANNER NAMES THE REAL LIMIT ─────────────────────────────────────────────────────')
  const bc = compile(REPO, ['components/dashboard/CapacityBreachBanner.tsx'], 'banner', { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false })
  installMocks(bc.out, { native: false })
  const React = require('react'); const { renderToString } = require('react-dom/server')
  const Banner = bc.req('components/dashboard/CapacityBreachBanner.js').CapacityBreachBanner
  const text = (breaches, orders) => renderToString(React.createElement(Banner, { breaches, onDismiss: () => {}, orders })).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
  const O9 = [{ order_key: 'k9', id: 9, slot: '20:30', items: [{ quantity: 16 }] }]
  const batch = [{ collection_time: '20:30', reason: 'Pizza 16/8', over_total: 0, over_cats: [{ cat: 'pizza', over: 8 }], order_keys: ['k9'], order_ids: [9], override_orders: [{ order_key: 'k9', id: 9, slot: '20:30' }] }]
  {
    // V2 — the old wording, unconditional: patch the headline back to the single string.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sixteen-v2-'))
    for (const d of ['components', 'lib']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
    const f = path.join(tmp, 'components/dashboard/CapacityBreachBanner.tsx'); const src = fs.readFileSync(f, 'utf8')
    const from = '                        {headline}', to = "                        {`Kitchen over capacity — ${total} ${total === 1 ? 'item' : 'items'} cooking for ${slot}`}"
    if (src.split(from).length !== 2) { console.log('🔴 V2 anchor not found'); process.exit(1) }
    fs.writeFileSync(f, src.replace(from, to))
    const vc = compile(tmp, ['components/dashboard/CapacityBreachBanner.tsx'], 'bannerV2', { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false }); installMocks(vc.out, { native: false })
    const VB = vc.req('components/dashboard/CapacityBreachBanner.js').CapacityBreachBanner
    const vt = renderToString(React.createElement(VB, { breaches: batch, onDismiss: () => {}, orders: O9 })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const bad = /Kitchen over capacity/.test(vt)
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 the old wording on a batch breach with kc NULL: "${(vt.match(/Kitchen over capacity[^#]*/) || [''])[0].trim()}"`)
    fs.rmSync(tmp, { recursive: true, force: true }); if (!bad) process.exit(1)
  }
  const t1 = text(batch, O9)
  check(t1.includes('Pizza over batch — 16 for 20:30 (8 per batch)'), `category batch: "${(t1.match(/Pizza over batch[^#]*/) || [''])[0].trim()}"`)
  check(!/Kitchen over capacity/.test(t1), '…and "Kitchen over capacity" is not said (kc is NULL)')
  check(t1.includes('#9 — 16 items') && t1.includes('Placed anyway: #9 for 20:30'), '…the contributor line and the placed-anyway line are unchanged')
  const t2 = text([{ collection_time: '18:30', reason: 'global ceiling', over_total: 2, over_cats: [], order_keys: ['k9'], order_ids: [9] }], [{ order_key: 'k9', id: 9, slot: '18:30', items: [{ quantity: 6 }] }])
  check(t2.includes('Kitchen over capacity — 6 items cooking for 18:30'), `kitchen ceiling: "${(t2.match(/Kitchen over capacity[^#]*/) || [''])[0].trim()}"`)
  const t3 = text([{ collection_time: '17:00', reason: 'over capacity at event-start', over_total: 0, over_cats: [{ cat: 'pizza', over: 2 }], order_keys: ['k9'], order_ids: [9] }], [{ order_key: 'k9', id: 9, slot: '17:00', items: [{ quantity: 10 }] }])
  check(t3.includes('Over capacity at event start — 10 items for 17:00'), `event-start pile: "${(t3.match(/Over capacity at event start[^#]*/) || [''])[0].trim()}"`)

  console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ an order is admitted against the board without itself, and the banner names the real limit'}`)
  process.exit(fails ? 1 : 0)
})().catch(e => { console.log('🔴 harness crashed: ' + (e && e.stack || e)); process.exit(1) })
