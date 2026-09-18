#!/usr/bin/env node
// scripts/seed-demo-grid.cjs — the demo seeder plans on the VAN's grid and admits every order through the
// engine, so a demo never shows a prospect an order at a time no picker could offer, and never a board
// the kitchen could not cook.
//   node scripts/seed-demo-grid.cjs      (≈ 20 s: three compiles incl. a clean HEAD worktree)
//
// 🔴 FAILURE MODE (docs/slot-interval-van-level-report.md, left as "identical while everything is 5"):
//   seedDemoOrders read kitchen capacity from the event's VAN but the collection interval from the TRUCK
//   (`trucks.collection_interval_mins`, then a `SLOT_INTERVAL_MINS = 5` constant for its own planning
//   grid). Set a demo van to 15-minute collection times and the seeded orders still landed at :05 and
//   :10 — times the dashboard, the customer page and the submit check all refuse — and none of them
//   carried a cooking reservation, so the first real order was projected against guessed splits.
//
// HOW: the REAL seeder, compiled from lib/, run against an in-memory Supabase fake (tables as arrays,
// the same select/eq/in/neq/not/order/limit/insert/update/delete shapes the seeder and the admission
// path call). Nothing here touches the database. A clean HEAD worktree's seeder proves "5 minutes is
// unchanged from today".
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, headWorktree, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const mins = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

// ── the fake ──────────────────────────────────────────────────────────────────────────────────────
function fakeSupabase(db) {
  const clone = x => JSON.parse(JSON.stringify(x))
  const filt = (rows, f) => rows.filter(r => f.every(([op, k, v]) => {
    if (op === 'eq') return r[k] === v
    if (op === 'neq') return r[k] !== v
    if (op === 'in') return v.includes(r[k])
    if (op === 'notis') return r[k] !== null && r[k] !== undefined
    return true
  }))
  const embed = (table, rows) => table === 'menu_items_db'
    ? rows.map(r => ({ ...r, menu_categories: db.menu_categories.find(c => c.id === r.category_id) ?? null }))
    : rows
  function builder(table) {
    const q = { f: [], op: 'select', payload: null, head: false, single: false, maybe: false, lim: null }
    const run = () => {
      const t = (db[table] = db[table] ?? [])
      if (q.op === 'insert') { const rows = Array.isArray(q.payload) ? q.payload : [q.payload]; for (const r of rows) t.push(clone(r)); return { data: null, error: null } }
      if (q.op === 'update') { for (const r of filt(t, q.f)) Object.assign(r, clone(q.payload)); return { data: null, error: null } }
      if (q.op === 'delete') { const keep = t.filter(r => !filt([r], q.f).length); t.splice(0, t.length, ...keep); return { data: null, error: null } }
      let rows = embed(table, filt(t, q.f)); if (q.lim != null) rows = rows.slice(0, q.lim)
      if (q.head) return { data: null, count: rows.length, error: null }
      if (q.single || q.maybe) return { data: rows[0] ? clone(rows[0]) : null, error: q.single && !rows[0] ? { message: 'no rows' } : null }
      return { data: clone(rows), count: rows.length, error: null }
    }
    const api = {
      select(_c, o) { if (o && o.head) q.head = true; return api },
      insert(p) { q.op = 'insert'; q.payload = p; return api },
      update(p) { q.op = 'update'; q.payload = p; return api },
      delete() { q.op = 'delete'; return api },
      eq(k, v) { q.f.push(['eq', k, v]); return api }, neq(k, v) { q.f.push(['neq', k, v]); return api },
      in(k, v) { q.f.push(['in', k, v]); return api }, not(k) { q.f.push(['notis', k]); return api },
      order() { return api }, limit(n) { q.lim = n; return api },
      single() { q.single = true; return Promise.resolve(run()) }, maybeSingle() { q.maybe = true; return Promise.resolve(run()) },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    return api
  }
  return { from: builder, rpc: async () => ({ data: null, error: null }) }
}
const EVENT = { id: 'ev1', truck_id: 'demo-x', van_id: 'van1', event_date: '2099-01-01', start_time: '15:00:00', end_time: '18:00:00', status: 'open', collection_interval_mins_override: null, operator_collection_interval_mins_override: null }
const catsFor = (prep, batch) => [{ id: 'c1', name: 'Burgers', prep_secs: prep, batch_size: batch, counts_toward_capacity: true }, { id: 'c2', name: 'Sides', prep_secs: 0, batch_size: 0, counts_toward_capacity: false }]
/** The Between Buns target: 8 at a time, 15 minutes a batch. */
const CATS = catsFor(900, 8)
/** Today's demo default (lib/provision-demo-event / buildDemoAssumptions): 4 at a time, 5 minutes. */
const CATS_TODAY = catsFor(300, 4)
const ITEMS = ['Classic', 'Cheese', 'Bacon', 'Veggie', 'Double'].map((n, i) => ({ id: `i${i}`, truck_id: 'demo-x', name: n, price: 9, category_id: 'c1', is_active: true }))
  .concat(['Fries', 'Slaw'].map((n, i) => ({ id: `s${i}`, truck_id: 'demo-x', name: n, price: 3, category_id: 'c2', is_active: true })))
const dbFor = (vanInterval, truckInterval = 5, opts = {}) => ({
  trucks: [{ id: 'demo-x', plan: 'demo', feature_overrides: {}, collection_interval_mins: truckInterval, slot_duration_mins: null }],
  truck_events: [EVENT],
  truck_vans: [{ id: 'van1', truck_id: 'demo-x', kitchen_capacity: opts.cap ?? null, capacity_window_mins: 5, collection_interval_mins: vanInterval, operator_collection_interval_mins: null }],
  menu_categories: (opts.cats ?? CATS).map(c => ({ ...c, truck_id: 'demo-x' })),
  menu_items_db: ITEMS, collection_times: [], production_slot_usage: [], orders: [],
  modifier_groups: [], item_modifier_groups: [], modifier_options: [],
})
const ARGS = { truckId: 'demo-x', eventId: 'ev1', eventDate: '2099-01-01', startTime: '15:00', endTime: '18:00', capacity: 4 }
const stubClient = out => fs.writeFileSync(path.join(out, 'lib', 'supabase.js'), 'module.exports = { supabase: null }')
const build = (root, tag) => { const c = compile(root, ['lib/seed-demo-orders.ts', 'lib/slot-availability.ts'], tag); stubClient(c.out); return c }
const summarise = db => db.orders.map(o => ({ slot: o.slot, burgers: o.items.filter(i => ITEMS.find(x => x.name === i.name)?.category_id === 'c1').reduce((s, i) => s + i.quantity, 0), items: o.items.map(i => `${i.name}×${i.quantity}`).join(','), res: o.cooking_reservation ?? null }))

;(async () => {
  console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
  {
    // V1 — the TRUCK-level interval restored as the planning grid. The van says 15, the truck says 5.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdg-v1-'))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/seed-demo-orders.ts'); const src = fs.readFileSync(f, 'utf8')
    const needle = '  const gridMins = intervals.customer'
    if (src.split(needle).length !== 2) { console.log('🔴 v1: the grid line was not found exactly once'); process.exit(1) }
    fs.writeFileSync(f, src.replace(needle, "  const gridMins = ((truckRow as { collection_interval_mins?: number | null } | null)?.collection_interval_mins ?? 5) as 5")
      .replace("select('plan, feature_overrides, slot_duration_mins')", "select('plan, feature_overrides, slot_duration_mins, collection_interval_mins')"))
    const { seedDemoOrders } = build(tmp, 'v1').req('lib/seed-demo-orders.js')
    const db = dbFor(15, 5); await seedDemoOrders(fakeSupabase(db), ARGS)
    const off = summarise(db).filter(o => mins(o.slot) % 15 !== 0)
    const failed = off.length > 0
    console.log(`  ${failed ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 truck-level interval, van at 15: ${off.length} of ${db.orders.length} seeded orders off the 15-minute grid (${off.slice(0, 4).map(o => o.slot).join(', ')})`)
    fs.rmSync(tmp, { recursive: true, force: true }); if (!failed) process.exit(1)
  }

  const real = build(REPO, 'sdgReal')
  const { seedDemoOrders } = real.req('lib/seed-demo-orders.js')
  const E = real.req('lib/slot-availability.js')

  console.log('\n── A VAN AT 15 MINUTES ──────────────────────────────────────────────────────────────────')
  const db15 = dbFor(15, 5); const r15 = await seedDemoOrders(fakeSupabase(db15), ARGS); const s15 = summarise(db15)
  const perSlot = list => { const m = new Map(); for (const o of list) m.set(o.slot, (m.get(o.slot) ?? 0) + o.burgers); return m }
  const grid15 = []; for (let m = mins('15:15'); m <= mins('18:00'); m += 15) grid15.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  const ps = perSlot(s15)
  console.log(`     ${s15.length} orders — burgers per time: ${grid15.map(t => `${t}=${ps.get(t) ?? 0}`).join(' ')}`)
  console.log(`     warnings: ${JSON.stringify(r15.warnings)}`)
  check(s15.length >= 4 && s15.every(o => mins(o.slot) % 15 === 0), 'every seeded order sits on a 15-minute time (a multiple of 15 from midnight)')
  check(s15.every(o => mins(o.slot) >= mins('15:00') && mins(o.slot) <= mins('18:00')), 'and every one is inside the event window')
  const busy = grid15.filter(t => (ps.get(t) ?? 0) >= 8).length, part = grid15.filter(t => { const n = ps.get(t) ?? 0; return n > 0 && n < 8 }).length, free = grid15.filter(t => !(ps.get(t) ?? 0)).length
  check(busy >= 1 && part >= 1 && free >= 1 && (busy + part) >= 4, `a realistic mix across the ${grid15.length} times: ${busy} full (8), ${part} part-loaded, ${free} free`)
  check(r15.warnings.every(w => !/STILL OVER|could not/.test(w)), `no post-condition warning (${r15.warnings.length} warning(s): ${JSON.stringify(r15.warnings).slice(0, 120)})`)
  const cooking = s15.filter(o => o.burgers > 0), sidesOnly = s15.filter(o => o.burgers === 0)
  check(cooking.length > 0 && cooking.every(o => o.res && o.res.v === 1 && o.res.cats.burgers && o.res.cats.burgers.batch === 8 && o.res.cats.burgers.prepMins === 15),
    `every seeded order that cooks something (${cooking.length}) carries a cooking reservation at batch 8 / prep 15 — the van's current settings`)
  check(cooking.every(o => o.res.slot === o.slot && o.res.cats.burgers.items === o.burgers), '…whose slot and item count match the row it belongs to')
  check(sidesOnly.every(o => !o.res), `and the ${sidesOnly.length} sides-only order(s) carry none — there is nothing to reserve`)

  // NO MINUTE OVER THE BATCH OR THE CAP — the engine's own projection over the inserted rows + reservations.
  const catConfigs = { burgers: { secs: 900, batch: 8, countsToCapacity: true }, sides: { secs: 0, batch: 0, countsToCapacity: false } }
  const units = {}; for (const o of s15) { units[o.slot] = units[o.slot] ?? {}; units[o.slot].burgers = (units[o.slot].burgers ?? 0) + o.burgers }
  const reservations = db15.orders.filter(o => o.cooking_reservation).map(o => ({ orderKey: o.order_key, slot: o.slot, source: o.cooking_reservation.source, cats: o.cooking_reservation.cats }))
  const back = E.projectBackwardOccupancy(units, catConfigs, mins('15:00'), null, 5, reservations, true)
  const burgerIvs = back.intervals.filter(iv => iv.cat === 'burgers')
  let worstMinute = 0
  for (let m = mins('15:00') - 30; m <= mins('18:00'); m++) { let load = 0; for (const iv of burgerIvs) if (iv.startMins <= m && m < iv.endMins) load += iv.items; worstMinute = Math.max(worstMinute, load) }
  check(worstMinute <= 8, `no minute has more than 8 burgers in the oven: peak ${worstMinute}`)
  { // …and with a kitchen cap of 8, the same board through the cap
    const dbCap = dbFor(15, 5, { cap: 8 }); await seedDemoOrders(fakeSupabase(dbCap), ARGS); const sc = summarise(dbCap)
    const u2 = {}; for (const o of sc) { u2[o.slot] = u2[o.slot] ?? {}; u2[o.slot].burgers = (u2[o.slot].burgers ?? 0) + o.burgers }
    const b2 = E.projectBackwardOccupancy(u2, catConfigs, mins('15:00'), 8, 5, dbCap.orders.filter(o => o.cooking_reservation).map(o => ({ orderKey: o.order_key, slot: o.slot, source: 'fit', cats: o.cooking_reservation.cats })), true)
    let worst = 0; for (let m = mins('14:30'); m <= mins('18:00'); m++) { let l = 0; for (const iv of b2.intervals) if (iv.startMins <= m && m < iv.endMins) l += iv.items; worst = Math.max(worst, l) }
    check(worst <= 8 && sc.every(o => mins(o.slot) % 15 === 0), `with kitchen_capacity 8 the cap holds at every minute too: peak ${worst}, ${sc.length} orders`)
  }

  console.log('\n── A VAN AT 5 MINUTES IS UNCHANGED FROM TODAY ───────────────────────────────────────────')
  const head = headWorktree('sdg')
  try {
    const before = build(head.wt, 'sdgHead').req('lib/seed-demo-orders.js').seedDemoOrders
    const dbH = dbFor(5, 5, { cats: CATS_TODAY }); await before(fakeSupabase(dbH), ARGS)
    const dbN = dbFor(5, 5, { cats: CATS_TODAY }); const rN = await seedDemoOrders(fakeSupabase(dbN), ARGS)
    const plan = db => summarise(db).map(o => `${o.slot} ${o.items}`).sort().join('|')
    const same = plan(dbH) === plan(dbN)
    check(same && dbN.orders.length > 0, `at today's settings (4 a batch, 5 minutes) the same ${dbN.orders.length} orders land at the same times with the same items as HEAD's seeder (HEAD: ${dbH.orders.length}; warnings: ${JSON.stringify(rN.warnings)})`)
    if (!same) { console.log('     HEAD:', plan(dbH).split('|').join('\n           ')); console.log('     NEW: ', plan(dbN).split('|').join('\n           ')) }
    const cooks = o => o.items.some(i => ITEMS.find(x => x.name === i.name)?.category_id === 'c1')
    check(dbH.orders.every(o => !o.cooking_reservation) && dbN.orders.filter(cooks).every(o => o.cooking_reservation), 'HEAD wrote no reservations; the fix writes one for every order that cooks')
  } finally { head.remove() }

  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ the seeder plans on the van\'s grid and every order is admitted by the engine')
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('HARNESS THREW', e); process.exit(1) })
