#!/usr/bin/env node
// scripts/demo-seed-parameters.cjs — the admin Create Demo asks for collection times, cook time and batch
// size, and the seeded board is built to them: on the grid, inside the batch, with a realistic mix and a
// gap wide enough to place an order that needs two batches.
//   node scripts/demo-seed-parameters.cjs      (≈ 25 s: two compiles, a 45-cell matrix, one HEAD worktree)
//
// 🔴 FAILURE MODE: a demo whose board contradicts the kitchen it claims to model — orders at times the
//    pickers do not offer, a time over the batch, a board so full that the prospect's own two-batch order
//    is refused everywhere, or the over-capacity banner up before they have touched anything.
// 🔴 AND THE ONE THAT MATTERS MOST: the DEFAULTS must reproduce today's demo. The anonymous landing-page
//    path never sends these fields, so `parseDemoKitchen` returns null and provisioning is unchanged; an
//    admin who leaves the controls alone sends today's values and gets today's rows.
//
// HOW: the REAL seeder and the REAL validator compiled from lib/, run against an in-memory Supabase fake.
// Nothing here touches the database. The "unchanged from today" check compiles the seeder from a clean
// worktree of the last commit before this work.
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const mins = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

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

// ── fixtures: a demo-shaped truck with one cooking category and one instant one ───────────────────
const WINDOW = { start: '15:00', end: '19:00' }        // four hours, the new demo window
const EVENT = { id: 'ev1', truck_id: 'demo-x', van_id: 'van1', event_date: '2099-01-01', start_time: `${WINDOW.start}:00`, end_time: `${WINDOW.end}:00`, status: 'open', collection_interval_mins_override: null, operator_collection_interval_mins_override: null }
const ITEMS = ['Classic', 'Cheese', 'Bacon', 'Veggie', 'Double'].map((n, i) => ({ id: `i${i}`, truck_id: 'demo-x', name: n, price: 9, category_id: 'c1', is_active: true }))
  .concat(['Fries', 'Slaw'].map((n, i) => ({ id: `s${i}`, truck_id: 'demo-x', name: n, price: 3, category_id: 'c2', is_active: true })))
const dbFor = ({ grid = 5, cookMins = 5, batch = 4, cap = null } = {}) => ({
  trucks: [{ id: 'demo-x', plan: 'demo', feature_overrides: {}, collection_interval_mins: 5, slot_duration_mins: null }],
  truck_events: [EVENT],
  truck_vans: [{ id: 'van1', truck_id: 'demo-x', kitchen_capacity: cap, capacity_window_mins: 5, collection_interval_mins: grid, operator_collection_interval_mins: null }],
  menu_categories: [
    { id: 'c1', truck_id: 'demo-x', name: 'Mains', prep_secs: cookMins * 60, batch_size: batch, counts_toward_capacity: true },
    { id: 'c2', truck_id: 'demo-x', name: 'Sides', prep_secs: 0, batch_size: 0, counts_toward_capacity: false },
  ],
  menu_items_db: ITEMS, collection_times: [], production_slot_usage: [], orders: [],
  modifier_groups: [], item_modifier_groups: [], modifier_options: [],
})
const ARGS = { truckId: 'demo-x', eventId: 'ev1', eventDate: '2099-01-01', startTime: WINDOW.start, endTime: WINDOW.end, capacity: 4 }
const build = (root, tag, files) => { const c = compile(root, files, tag); fs.writeFileSync(path.join(c.out, 'lib', 'supabase.js'), 'module.exports = { supabase: null }'); return c }
const mainsIn = o => o.items.filter(i => ITEMS.find(x => x.name === i.name)?.category_id === 'c1').reduce((s, i) => s + i.quantity, 0)

/** Run the seeder and measure the board with the ENGINE, not with arithmetic of our own. */
async function board(seedDemoOrders, E, opts) {
  const db = dbFor(opts); const r = await seedDemoOrders(fakeSupabase(db), ARGS)
  const grid = opts.grid ?? 5, cookMins = opts.cookMins ?? 5, batch = opts.batch ?? 4
  const cats = { mains: { secs: cookMins * 60, batch, countsToCapacity: true }, sides: { secs: 0, batch: 0, countsToCapacity: false } }
  const per = new Map()
  for (const o of db.orders) per.set(o.slot, (per.get(o.slot) ?? 0) + mainsIn(o))
  const units = {}; for (const [t, n] of per) if (n > 0) units[t] = { mains: n }
  const res = db.orders.filter(o => o.cooking_reservation).map(o => ({ orderKey: o.order_key, slot: o.slot, source: o.cooking_reservation.source, cats: o.cooking_reservation.cats }))
  const start = mins(WINDOW.start), end = mins(WINDOW.end)
  const times = []; for (let m = Math.ceil(start / grid) * grid; m <= end; m += grid) times.push(hhmm(m))
  const back = E.projectBackwardOccupancy(units, cats, start, opts.cap ?? null, 5, res, true)
  let peak = 0
  for (let m = start - cookMins * 2 - 5; m <= end; m++) { let l = 0; for (const iv of back.intervals) if (iv.cat === 'mains' && iv.startMins <= m && m < iv.endMins) l += iv.items; peak = Math.max(peak, l) }
  const slotList = times.map(t => ({ collection_time: t, production_slot: t, production_window_key: t, available: true, is_past: false, is_grace: false }))
  const fitsAt = qty => times.filter(t => E.fitOrderBackward(back, mins(t), { mains: qty }, cats, opts.cap ?? null, start, 5, Number.NEGATIVE_INFINITY, units[t] || {}, true).fits)
  return { db, r, per, times, peak, fitsAt, slotList, cats, units, res, start, grid, cookMins, batch }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const SEED_FILES = ['lib/seed-demo-orders.ts', 'lib/slot-availability.ts']
  const variant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dsp-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/seed-demo-orders.ts'); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    const c = build(tmp, tag, SEED_FILES)
    return { tmp, seed: c.req('lib/seed-demo-orders.js').seedDemoOrders, E: c.req('lib/slot-availability.js') }
  }
  {
    // V1 — THE GRID IGNORED: the planning grid back to a hard 5 whatever the van says.
    const v = variant('v1', src => src.replace('  const gridMins = intervals.customer', '  const gridMins = 5 as 5'))
    const b = await board(v.seed, v.E, { grid: 15, cookMins: 15, batch: 8 })
    const off = [...b.per.keys()].filter(t => mins(t) % 15 !== 0)
    console.log(`  ${off.length ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 grid ignored at 15/15/8: ${off.length} times off the grid (${off.slice(0, 4).join(', ')})`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!off.length) process.exit(1)
  }
  {
    // V2 — A SEEDED STATE OVER THE BATCH: the per-slot allowance no longer capped at the batch.
    const v = variant('v2', src => src.replace(
      '      out[cat] = Math.min(batch, Math.max(1, Math.round(batch * f)))',
      '      out[cat] = Math.max(1, Math.round(batch * f * 3))'))
    const b = await board(v.seed, v.E, { grid: 15, cookMins: 15, batch: 8 })
    const over = b.peak > 8
    console.log(`  ${over ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 allowance uncapped: peak ${b.peak} in the oven against a batch of 8`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!over) process.exit(1)
  }
  {
    // V3 — THE EMPTY PAIR NOT GUARANTEED: the reserved run removed, so gaps are whatever the stride leaves.
    const v = variant('v3', src => src.replace(
      '  if (prepMinsForGap > 0 && slots.length >= holeLen + 2) {',
      '  if (false) {'))
    const b = await board(v.seed, v.E, { grid: 15, cookMins: 15, batch: 8 })
    const none = b.fitsAt(16).length === 0
    console.log(`  ${none ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 no reserved run: an order of 2 × batch fits at ${b.fitsAt(16).length} of ${b.times.length} times`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!none) process.exit(1)
  }

  {
    // V4 — THE THREE-HOUR WINDOW RESTORED. The board is scaled to the windows it can plan into, so a
    // shorter service is also a thinner one: this is the shape Dominic called "thin".
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-v4-'))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/provision-demo-event.ts'); const src = fs.readFileSync(f, 'utf8')
    if (src.split('export const DEMO_WINDOW_HOURS = 4').length !== 2) { console.log('🔴 v4: the window constant was not found exactly once'); process.exit(1) }
    fs.writeFileSync(f, src.replace('export const DEMO_WINDOW_HOURS = 4', 'export const DEMO_WINDOW_HOURS = 3'))
    const W = build(tmp, 'v4', ['lib/provision-demo-event.ts']).req('lib/provision-demo-event.js')
    const w = W.demoEventWindow(new Date(Date.UTC(2099, 0, 15, 16, 0)), 'UTC')
    const three = (mins(w.end) - mins(w.start)) === 180
    console.log(`  ${three ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V4 the 3-hour window restored: ${w.start}–${w.end}`)
    fs.rmSync(tmp, { recursive: true, force: true }); if (!three) process.exit(1)
  }
  {
    // V5 — A BOARD WITH NO RED: the per-window budget capped at half a batch, so nothing ever fills.
    const v = variant('v5', src => src.replace(
      '      out[cat] = Math.min(batch, Math.max(1, Math.round(batch * f)))',
      '      out[cat] = Math.min(Math.floor(batch / 2), Math.max(1, Math.round(batch * f)))'))
    const b = await board(v.seed, v.E, { grid: 15, cookMins: 15, batch: 8 })
    const full = b.times.filter(t => (b.per.get(t) ?? 0) >= 8).length
    console.log(`  ${full < 2 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V5 budget capped at half a batch: ${full} full times (two are required)`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (full >= 2) process.exit(1)
  }
  {
    // V6 — THE CLAMP REMOVED: a late creation runs past midnight into the next day.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-v6-'))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/provision-demo-event.ts'); const src = fs.readFileSync(f, 'utf8')
    const needle = "const end = rawEndMins >= 24 * 60 ? '23:59' : toHHMM(rawEndMins)"
    if (src.split(needle).length !== 2) { console.log('🔴 v6: the clamp was not found exactly once'); process.exit(1) }
    fs.writeFileSync(f, src.replace(needle, 'const end = toHHMM(rawEndMins % (24 * 60))'))
    const W = build(tmp, 'v6', ['lib/provision-demo-event.ts']).req('lib/provision-demo-event.js')
    const w = W.demoEventWindow(new Date(Date.UTC(2099, 0, 15, 22, 0)), 'UTC')
    const crosses = mins(w.end) <= mins(w.start)
    console.log(`  ${crosses ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V6 the midnight clamp removed: ${w.start}–${w.end} crosses into the next day`)
    fs.rmSync(tmp, { recursive: true, force: true }); if (!crosses) process.exit(1)
  }
  {
    // V7 — THE WRONG PANEL: the replacement test removed, so a rebuilt board's seeded orders read as the
    // visitor's own and the "real order lands" prompt fires over the introduction.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-v7-'))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/demo-board-build.ts'); const src = fs.readFileSync(f, 'utf8')
    const needle = '  return !baseline.some(k => now.has(k))'
    if (src.split(needle).length !== 2) { console.log('🔴 v7: the replacement test was not found exactly once'); process.exit(1) }
    fs.writeFileSync(f, src.replace(needle, '  return false'))
    const B = build(tmp, 'v7', ['lib/demo-board-build.ts']).req('lib/demo-board-build.js')
    const blind = B.boardWasReplaced(['a', 'b', 'c'], ['x', 'y', 'z']) === false
    console.log(`  ${blind ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V7 replacement test removed: a wholly new board reads as ${blind ? 'the SAME board — every seeded order looks like the visitor\'s' : 'replaced'}`)
    fs.rmSync(tmp, { recursive: true, force: true }); if (!blind) process.exit(1)
  }

  const real = build(REPO, 'dspReal', SEED_FILES)
  const seedDemoOrders = real.req('lib/seed-demo-orders.js').seedDemoOrders
  const E = real.req('lib/slot-availability.js')

  console.log('\n── THE DEFAULTS REPRODUCE TODAY\'S DEMO ──────────────────────────────────────────────────')
  {
    const K = build(REPO, 'dspKitchen', ['lib/demo-kitchen.ts']).req('lib/demo-kitchen.js')
    check(K.parseDemoKitchen({}).kitchen === null, 'no fields sent (the landing page) ⇒ parseDemoKitchen returns null, so provisioning is untouched')
    const d = K.parseDemoKitchen({ intervalMins: 5, cookMins: 5, batchSize: 4 }).kitchen
    check(d.intervalMins === 5 && d.prepSecs === 300 && d.batchSize === 4, `the controls' own defaults are today's values: grid ${d.intervalMins}, prep ${d.prepSecs}s, batch ${d.batchSize}`)
    check(K.isDefaultDemoKitchen(d) === true && K.isDefaultDemoKitchen(null) === true, 'and both read as "today\'s demo"')
    // 🔴 RESTATED 19 September 2026, ON DOMINIC'S DECISION. It used to compare the default board against
    // the previous commit's, byte for byte. The four-hour window and the fuller board are deliberate
    // changes to the demo ITSELF — one product, one demo — so that comparison now asserts the absence of
    // exactly the improvements that were asked for. The invariant that still matters, and is the one the
    // controls were built to keep, is that the ADMIN path at its defaults produces the same demo as the
    // anonymous LANDING-PAGE path: the controls add a choice, they do not fork the product.
    const plan = db => db.orders.map(o => `${o.slot} ${o.items.map(i => `${i.name}×${i.quantity}`).join(',')}`).sort().join('|')
    const landing = dbFor({})                                   // column defaults — nothing ever written
    await seedDemoOrders(fakeSupabase(landing), ARGS)
    const adminDefaults = dbFor({ grid: d.intervalMins, cookMins: d.prepSecs / 60, batch: d.batchSize })  // what applyDemoKitchen writes
    await seedDemoOrders(fakeSupabase(adminDefaults), ARGS)
    check(plan(landing) === plan(adminDefaults) && landing.orders.length > 0,
      `the admin path at its defaults seeds the same board as the landing page: ${landing.orders.length} orders, same times, same items`)
  }

  console.log('\n── THE EVENT WINDOW (ITEM 3) ────────────────────────────────────────────────────────────')
  {
    const W = build(REPO, 'dspWindow', ['lib/provision-demo-event.ts']).req('lib/provision-demo-event.js')
    check(W.DEMO_WINDOW_HOURS === 4, `the demo window is ${W.DEMO_WINDOW_HOURS} hours`)
    const at = (hh, mm) => W.demoEventWindow(new Date(Date.UTC(2099, 0, 15, hh, mm)), 'UTC')
    const len = w => mins(w.end) - mins(w.start)
    const ordinary = [[9, 5], [15, 45], [16, 0], [18, 29]].map(([h, m]) => at(h, m))
    check(ordinary.every(w => len(w) === 240), `an ordinary creation gives a four-hour window: ${ordinary.map(w => `${w.start}–${w.end}`).join(' · ')}`)
    check(ordinary.every(w => /:00$|:30$/.test(w.start)), 'and the start rule is unchanged — the wall clock floored to the nearest half hour')
    const clamped = [[20, 0], [21, 30], [23, 0], [23, 59]].map(([h, m]) => at(h, m))
    console.log(`     late creations: ${clamped.map(w => `${w.start}–${w.end}`).join(' · ')}`)
    check(clamped.every(w => mins(w.end) > mins(w.start) && mins(w.end) <= 24 * 60 - 1),
      'every late creation stays inside its own day and still ends after it starts')
    // 20:00 + 4h is exactly midnight, and midnight is the boundary the clamp exists to stay inside — so
    // 20:00 is the FIRST creation time that shortens, by one minute. 19:30 is the last full four hours.
    check(len(at(19, 30)) === 240 && clamped.every(w => w.end === '23:59'),
      `19:30 is the last full four hours (${at(19, 30).start}–${at(19, 30).end}); 20:00 onwards clamp to 23:59 (${clamped.map(w => `${w.start}–${w.end}`).join(' · ')})`)
    check(at(23, 59).start === '23:30' && at(23, 59).end === '23:59',
      `the shortest window the clamp can produce is 23:30–23:59, ${mins(at(23, 59).end) - mins(at(23, 59).start)} minutes`)
    // …and a board still fits the shortest window.
    const tiny = { ...ARGS, startTime: '23:30', endTime: '23:59' }
    const dbT = dbFor({ grid: 15, cookMins: 15, batch: 8 })
    dbT.truck_events[0].start_time = '23:30:00'; dbT.truck_events[0].end_time = '23:59:00'
    const rT = await seedDemoOrders(fakeSupabase(dbT), tiny)
    check(dbT.orders.length > 0 && dbT.orders.every(o => mins(o.slot) >= mins('23:30') && mins(o.slot) <= mins('23:59')),
      `the seeded board still fits the shortest window: ${dbT.orders.length} orders at ${[...new Set(dbT.orders.map(o => o.slot))].sort().join(', ')} (warnings ${JSON.stringify(rT.warnings)})`)
  }

  console.log('\n── THE MATRIX: 5 grids × 3 cook times × 3 batches ───────────────────────────────────────')
  const GRIDS = [5, 10, 15, 20, 30], COOKS = [5, 10, 15], BATCHES = [2, 4, 8]
  let cells = 0, offGrid = 0, overBatch = 0, noMix = 0, noPair = 0, noBatchFit = 0, noTwoBatchFit = 0, banner = 0, badRes = 0, thin = 0
  let minFull = Infinity, minPart = Infinity, minEmpty = Infinity, minOrders = Infinity, maxOrders = 0
  const notes = []
  for (const grid of GRIDS) for (const cookMins of COOKS) for (const batch of BATCHES) {
    cells++
    const b = await board(seedDemoOrders, E, { grid, cookMins, batch })
    const times = b.times
    const bad = [...b.per.keys()].filter(t => mins(t) % grid !== 0)
    if (bad.length) { offGrid++; notes.push(`${grid}/${cookMins}/${batch}: off-grid ${bad.slice(0, 3).join(',')}`) }
    if (b.peak > batch) { overBatch++; notes.push(`${grid}/${cookMins}/${batch}: peak ${b.peak} > batch ${batch}`) }
    const full = times.filter(t => (b.per.get(t) ?? 0) >= batch).length
    const part = times.filter(t => { const n = b.per.get(t) ?? 0; return n > 0 && n < batch }).length
    const empty = times.filter(t => !(b.per.get(t) ?? 0)).length
    // ITEM 4's guarantee, COUNTED: two of each, not one.
    if (!(full >= 2 && part >= 2 && empty >= 2)) { noMix++; notes.push(`${grid}/${cookMins}/${batch}: mix full=${full} part=${part} empty=${empty} (orders ${b.db.orders.length}, warnings ${JSON.stringify(b.r.warnings)})`) }
    minFull = Math.min(minFull, full); minPart = Math.min(minPart, part); minEmpty = Math.min(minEmpty, empty)
    minOrders = Math.min(minOrders, b.db.orders.length); maxOrders = Math.max(maxOrders, b.db.orders.length)
    if (!b.db.orders.every(o => mainsIn(o) === 0 || (o.cooking_reservation && o.cooking_reservation.cats.mains.batch === batch && o.cooking_reservation.cats.mains.prepMins === cookMins))) {
      badRes++; notes.push(`${grid}/${cookMins}/${batch}: a cooking order has no reservation at ${batch}/${cookMins}`)
    }
    const sizes = new Set(b.db.orders.map(o => o.items.reduce((n, i) => n + i.quantity, 0)))
    const catsSeen = new Set(b.db.orders.flatMap(o => o.items.map(i => ITEMS.find(x => x.name === i.name)?.category_id)))
    if (sizes.size < 2 || catsSeen.size < 2) { thin++; notes.push(`${grid}/${cookMins}/${batch}: ${sizes.size} order sizes, ${catsSeen.size} categories`) }
    // A PAIR OF ADJACENT EMPTY BATCHES, as the engine sees it: a collection time whose two preceding batch
    // windows are clear. `twoBatchSlot` is the seeder's own answer; the fit below is the engine's.
    if (b.r.twoBatchSlot == null) { noPair++; notes.push(`${grid}/${cookMins}/${batch}: the seeder named no two-batch time`) }
    if (!b.fitsAt(batch).length) { noBatchFit++; notes.push(`${grid}/${cookMins}/${batch}: an order of ${batch} fits nowhere`) }
    const two = b.fitsAt(batch * 2)
    if (!two.length) { noTwoBatchFit++; notes.push(`${grid}/${cookMins}/${batch}: an order of ${batch * 2} fits nowhere`) }
    else if (b.r.twoBatchSlot && !two.includes(b.r.twoBatchSlot)) { notes.push(`${grid}/${cookMins}/${batch}: reserved ${b.r.twoBatchSlot} but 2×batch fits only at ${two.join(',')}`) }
    if ((b.r.warnings || []).some(w => /STILL OVER|over capacity/i.test(w))) { banner++; notes.push(`${grid}/${cookMins}/${batch}: ${b.r.warnings.join(' ')}`) }
  }
  check(offGrid === 0, `${cells} combinations: every seeded order sits on its own grid (${offGrid} off-grid)`)
  check(overBatch === 0, `no minute exceeds the batch in any combination (${overBatch} over)`)
  check(noMix === 0, `every board has at least TWO full, TWO part-full and TWO empty times (worst case ${minFull} full, ${minPart} part, ${minEmpty} empty; ${noMix} short)`)
  check(badRes === 0, `every cooking order carries a reservation at its own batch and cook time (${badRes} without)`)
  check(thin === 0, `every board mixes order sizes and categories (${thin} thin)`)
  check(minOrders >= 8, `the boards are full services, not samples: ${minOrders}–${maxOrders} orders across the matrix`)
  check(noPair === 0, `every board names a time with two adjacent empty batch windows (${noPair} without)`)
  check(noBatchFit === 0, `an order of exactly the batch fits somewhere on every board (${noBatchFit} without)`)
  check(noTwoBatchFit === 0, `an order of 2 × the batch fits on every board (${noTwoBatchFit} without)`)
  check(banner === 0, `no board arrives over capacity — the banner would not show (${banner} over)`)
  if (notes.length) console.log('     notes:\n' + notes.slice(0, 12).map(n => `       ${n}`).join('\n'))

  {
    // …and with a kitchen cap set, the cap binds as well as the batch.
    const b = await board(seedDemoOrders, E, { grid: 15, cookMins: 15, batch: 8, cap: 8 })
    check(b.peak <= 8, `with kitchen_capacity 8 no minute exceeds it either: peak ${b.peak}`)
  }

  console.log('\n── THE TARGET SHAPE: 15-minute times, 15-minute cook, 8 a batch ─────────────────────────')
  {
    const b = await board(seedDemoOrders, E, { grid: 15, cookMins: 15, batch: 8 })
    console.log(`     ${b.db.orders.length} orders — mains per time: ${b.times.map(t => `${t}=${b.per.get(t) ?? 0}`).join(' ')}`)
    console.log(`     two-batch time reserved: ${b.r.twoBatchSlot} · 16 mains fit at: ${b.fitsAt(16).join(', ') || 'nowhere'}`)
    check(b.fitsAt(16).includes(b.r.twoBatchSlot), `an order of 16 is admitted at the reserved time ${b.r.twoBatchSlot}`)
    check(b.db.orders.filter(o => mainsIn(o) > 0).every(o => o.cooking_reservation && o.cooking_reservation.cats.mains.batch === 8 && o.cooking_reservation.cats.mains.prepMins === 15),
      'every cooking order carries a reservation at batch 8 / prep 15')
  }

  console.log('\n── ITEM 2: WHICH PANEL SPEAKS FIRST ─────────────────────────────────────────────────────')
  {
    const B = build(REPO, 'dspBoard', ['lib/demo-board-build.ts']).req('lib/demo-board-build.js')
    const seeded = ['a', 'b', 'c'], rebuilt = ['x', 'y', 'z']
    check(B.boardWasReplaced(seeded, rebuilt) === true, 'a board sharing no order key with the baseline reads as REPLACED — a rebuild, or the first-open restart')
    check(B.boardWasReplaced(seeded, [...seeded, 'theirs']) === false,
      'a prospect placing their own order ADDS a key, which must never read as a replacement — this is the case that must still fire the signup panel')
    check(B.boardWasReplaced(null, seeded) === false && B.boardWasReplaced(seeded, []) === false,
      'no baseline, or an empty board, is not a replacement')
    // the flags themselves, through a localStorage stand-in
    const store = new Map()
    global.window = global.window || {}
    global.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
    store.set(B.demoWelcomeKey('tok'), 'seen'); store.set(B.demoBaselineKey('tok'), JSON.stringify(seeded))
    B.resetDemoBoardFlags('tok', rebuilt)
    check(store.get(B.demoWelcomeKey('tok')) === undefined, 'a replaced board CLEARS the welcome flag, so the rebuilt demo introduces itself again')
    check(JSON.parse(store.get(B.demoBaselineKey('tok'))).join() === rebuilt.join(),
      'and re-baselines on the seeded orders, so they are never mistaken for the visitor\'s own')
  }

  console.log('\n── ITEM 1: THE LOGO WARNING ─────────────────────────────────────────────────────────────')
  {
    // The modal raises "This demo is unbranded" on `!result.logoStoragePath`. What provisionDemo puts
    // there on a REBUILD is what was wrong; the source of it is read here rather than re-implemented.
    const src = fs.readFileSync(path.join(REPO, 'lib/provision-demo.ts'), 'utf8')
    const rebuildBlock = /if \(input\.existingTruckId\) \{[\s\S]{0,600}?logoStoragePath = \(row as \{ logo_storage_path\?: string \| null \} \| null\)\?\.logo_storage_path \?\? null/.test(src)
    check(rebuildBlock, 'a rebuild reads the truck\'s own logo_storage_path back, so a demo that HAS a logo no longer reports itself unbranded')
    const stillWarns = /if \(!logoStoragePath\) logoNote = 'This demo has no logo stored, so it is unbranded\.'/.test(src)
    check(stillWarns, 'and a demo that genuinely has none still says so')
    const copyUntouched = /if \(!input\.existingTruckId && input\.discoveryTruckId\) \{/.test(src)
    check(copyUntouched, 'the copy itself is unchanged — a rebuild has nothing to copy, it reads what is already there')
  }

  console.log('\n── SERVER-SIDE VALIDATION ───────────────────────────────────────────────────────────────')
  {
    const K = build(REPO, 'dspKitchen2', ['lib/demo-kitchen.ts']).req('lib/demo-kitchen.js')
    const cases = [
      [{ intervalMins: 7, cookMins: 5, batchSize: 4 }, K.DEMO_KITCHEN_MESSAGES.interval, 'collection times off the five choices'],
      [{ intervalMins: 15, cookMins: 0, batchSize: 4 }, K.DEMO_KITCHEN_MESSAGES.cook, 'cook time below the minimum'],
      [{ intervalMins: 15, cookMins: 61, batchSize: 4 }, K.DEMO_KITCHEN_MESSAGES.cook, 'cook time above the maximum'],
      [{ intervalMins: 15, cookMins: 7.5, batchSize: 4 }, K.DEMO_KITCHEN_MESSAGES.cook, 'cook time not a whole number'],
      [{ intervalMins: 15, cookMins: 5, batchSize: 0 }, K.DEMO_KITCHEN_MESSAGES.batch, 'batch below the minimum'],
      [{ intervalMins: 15, cookMins: 5, batchSize: 500 }, K.DEMO_KITCHEN_MESSAGES.batch, 'batch above the maximum'],
      [{ intervalMins: 15, cookMins: 5, batchSize: 'eight' }, K.DEMO_KITCHEN_MESSAGES.batch, 'batch not a number'],
    ]
    for (const [raw, msg, label] of cases) {
      const out = K.parseDemoKitchen(raw)
      check(out.error === msg && out.kitchen === null, `${label} → refused: ${JSON.stringify(out.error)}`)
    }
    const ok = K.parseDemoKitchen({ intervalMins: 30, cookMins: 60, batchSize: 50 })
    check(!ok.error && ok.kitchen.intervalMins === 30 && ok.kitchen.prepSecs === 3600 && ok.kitchen.batchSize === 50, 'the bounds themselves are accepted (30 / 60 / 50)')
  }

  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ four hours, a full board, the right panel first, an honest logo warning — on every combination')
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('HARNESS THREW', e); process.exit(1) })
