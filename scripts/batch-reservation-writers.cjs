#!/usr/bin/env node
// scripts/batch-reservation-writers.cjs — every placement path writes a reservation; a failed write
// leaves null and never touches the order; the column is named in NO shared select; one status filter.
//   node scripts/batch-reservation-writers.cjs
// 🔴 FAILURE MODE: a placement path that forgets to write (P3 would then have no data for it); a write
// that THROWS and fails the order it was decorating; the column leaking into a select another surface
// depends on (the day the migration has not landed, that surface 500s); or a reader counting a status
// the write path does not.
const fs = require('fs'), os = require('os'), path = require('path')
const { execFileSync } = require('child_process')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

/** A fake supabase whose orders UPDATE fails (or throws) — and records every call. */
function fakeSupabase(mode) {
  const calls = []
  const chain = (table, op) => { const p = new Proxy(function () {}, { get: (_t, prop) => {
    if (prop === 'then') return (res, rej) => { calls.push([table, op]); if (op === 'update' && mode === 'throw') return rej(new Error('boom')); if (op === 'update' && mode === 'fail') return res({ data: null, error: { code: '42703', message: 'column orders.cooking_reservation does not exist' } })
      if (table === 'orders' && op === 'select') return res({ data: { order_key: 'k1', slot: '17:30', items: [{ name: 'Margherita', quantity: 9 }], deals: null, status: 'confirmed', event_date: '2099-01-01', capacity_ack_at: null }, error: null })
      if (table === 'menu_items_db') return res({ data: [{ name: 'Margherita', category_id: 'c1' }], error: null })
      if (table === 'menu_categories') return res({ data: [{ id: 'c1', name: 'Pizza', prep_secs: 900, batch_size: 8, counts_toward_capacity: true }], error: null })
      if (table === 'truck_events') return res({ data: { start_time: '17:00:00', van_id: 'v1' }, error: null })
      if (table === 'truck_vans') return res({ data: { kitchen_capacity: null, capacity_window_mins: 5 }, error: null })
      return res({ data: null, error: null }) }
    return (..._a) => p }, apply: () => p }); return p }
  return { calls, from: (t) => ({ select: () => chain(t, 'select'), update: () => chain(t, 'update'), upsert: () => chain(t, 'upsert'), insert: () => chain(t, 'insert') }) }
}
function loadWriter(root, tag) {
  const c = compile(root, ['lib/orders/cooking-reservation.ts'], tag)
  fs.writeFileSync(path.join(c.out, 'lib', 'supabase.js'), 'module.exports = { supabase: null }')   // eventKitchenCapacity uses the module client; the fake below stands in
  return c
}
;(async () => {
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: a writer that RETHROWS on failure — the order it decorates would fail with it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brw-v1-')); fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true }); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const f = path.join(tmp, 'lib/orders/cooking-reservation.ts'); let src = fs.readFileSync(f, 'utf8')
  const needle = "    console.warn('[reservations] write threw — order unchanged:', e instanceof Error ? e.message : e)\n    return null"
  if (src.split(needle).length !== 2) { console.log('🔴 could not patch the writer'); process.exit(1) }
  fs.writeFileSync(f, src.replace(needle, '    throw e'))
  // the fake client must also stand in for eventKitchenCapacity's module-level import
  const c = loadWriter(tmp, 'brwV1'); const W = c.req('lib/orders/cooking-reservation.js')
  const sb = fakeSupabase('throw')
  let threw = false; const origWarn = console.warn; console.warn = () => {}
  try { await W.writeCookingReservation(sb, { truckId: 't', eventId: 'ev', orderKey: 'k1' }) } catch { threw = true } finally { console.warn = origWarn }
  console.log(`  ${threw ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 a writer that rethrows: the placement would ${threw ? 'FAIL with it' : 'survive'}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  if (!threw) process.exit(1)
}
console.log('\n── THE REAL WRITER NEVER THROWS, AND LEAVES NULL ON FAILURE ────────────────────────────')
{
  const c = loadWriter(REPO, 'brw'); const W = c.req('lib/orders/cooking-reservation.js')
  const origWarn = console.warn; const warns = []; console.warn = (...a) => warns.push(a.join(' '))
  let threw = null, out
  for (const mode of ['fail', 'throw']) {
    const sb = fakeSupabase(mode)
    try { out = await W.writeCookingReservation(sb, { truckId: 't', eventId: 'ev', orderKey: 'k1' }) } catch (e) { threw = e }
    check(!threw && out === null, `update ${mode === 'fail' ? 'returns 42703' : 'throws'} → writer resolves null, throws nothing`)
    check(!sb.calls.some(([t, op]) => t === 'orders' && op !== 'select' && op !== 'update'), 'the order row is touched by nothing but the one cooking_reservation update')
  }
  console.warn = origWarn
  check(warns.some(w => /42703/.test(w)) && !warns.some(w => /PGRST204/.test(w)), `42703 logged as "absent (migration not applied)" and NOT as PGRST204 (${warns.length} warnings)`)
  // no event ⇒ nothing to compute, nothing written
  const sb = fakeSupabase('fail'); out = await W.writeCookingReservation(sb, { truckId: 't', eventId: null, orderKey: 'k1' })
  check(out === null && sb.calls.length === 0, 'no event_id ⇒ no query at all, null')
}
console.log('\n── EVERY PLACEMENT PATH WRITES; THE SHAPE IS v1 ─────────────────────────────────────────')
{
  const sites = [
    ['app/api/orders/submit/route.ts', /order = \{ order_key: \(rpcData as any\)\.order_key \}\n[\s\S]{0,400}?if \(batchReservationsOn && claimReservation\) await writeReservationRecord\(supabase, \{ truckId: resolvedTruckId, orderKey: String\(order\.order_key\), record: claimReservation \}\)\n\s*else await writeCookingReservation\(supabase, \{ truckId: resolvedTruckId, eventId: eventRow\?\.id \?\? null, orderKey: String\(order\.order_key\) \}\)/, 'customer submit — after place_order_atomic succeeded (P3 record when ON, P2 writer when OFF)'],
    ['lib/payments/promote-draft.ts', /await writeCookingReservation\(supabase, \{ truckId: draft\.truck_id, eventId: eventRow\?\.id \?\? null, orderKey \}\)/, 'promoteDraft — after the order row insert'],
    ['app/api/dashboard/action/route.ts', /if \(orderEventId\) await rebuildProductionSlotUsage\(supabase, truck\.id, eventDate\)\n[\s\S]{0,700}?admitForManual\([\s\S]{0,300}?writeReservationRecord\([\s\S]{0,200}?else await writeCookingReservation\(supabase, \{ truckId: truck\.id, eventId: orderEventId, orderKey: okey \}\)/, 'operator manual (walk-up, "Place it anyway", outreach replay) — admitted + written inside the lock (ON), P2 writer (OFF)'],
    ['app/api/dashboard/action/route.ts', /const editLock = editNeedsLock \? await acquireEventLock\(truck\.id, order\.event_date\) : null[\s\S]{0,9000}?admitForManual\(supabase, truck\.id, order\.event_id, order\.event_date, orderKey, String\(newSlot\)[\s\S]{0,300}?else await writeCookingReservation\(supabase, \{ truckId: truck\.id, eventId: order\.event_id, orderKey \}\)[\s\S]{0,600}?finally \{ if \(editLock\?\.ok\) await releaseEventLock\(truck\.id, order\.event_date\) \}/, 'edit — under a per-event lock, re-admitted at its new time (ON) or P2 writer (OFF), released after'],
  ]
  for (const [f, re, label] of sites) check(re.test(read(f)), `${label} (${f})`)
  const w = read('lib/orders/cooking-reservation.ts')
  check(!/from '@\/lib\/supabase'|from '@\/lib\/orders\/place-in-slot'/.test(w), 'the writer imports neither the module client nor place-in-slot — every read goes through the client it is handed')
  check(/source: order\.capacity_ack_at \? 'override' : 'fit'/.test(w), "source comes from capacity_ack_at on the order row: 'override' when the operator placed it anyway")
  check(/v: 1, source, slot, computed: \{ eventStartMins, capacityWindowMins, kitchenCapacity, gridIntervalMins \}, cats/.test(w), 'the stored shape is v1 with computed{eventStartMins, capacityWindowMins, kitchenCapacity, gridIntervalMins} and per-category windows')
  check(!/cooking_reservation/.test(read('app/api/dashboard/action/route.ts').split('\n').filter(l => /\.select\(/.test(l)).join('\n')), 'cancel / reject / refund write nothing — no cooking_reservation in any dashboard-action select or update besides the writer')
}
console.log('\n── NO SHARED NAMED SELECT NAMES THE COLUMN; ONE STATUS FILTER ───────────────────────────')
{
  const hits = execFileSync('bash', ['-c', `grep -rn "cooking_reservation" ${REPO}/app ${REPO}/lib ${REPO}/components | grep -E "\\.select\\(|\\.update\\(|\\.insert\\(|\\.upsert\\(" || true`]).toString().trim().split('\n').filter(Boolean).map(l => l.replace(REPO + '/', ''))
  check(hits.length === 3 && hits.filter(h => h.startsWith('lib/slot-bookings.ts') && /select\('order_key, slot, cooking_reservation'\)/.test(h)).length === 1 && hits.filter(h => h.startsWith('lib/orders/cooking-reservation.ts') && /update\(\{ cooking_reservation/.test(h)).length === 2, `the column appears in exactly three queries — the probed read and the two writers' own updates (P2 recompute, P3 record): ${JSON.stringify(hits.map(h => h.split(':').slice(0, 2).join(':')))}`)
  const sb = read('lib/slot-bookings.ts')
  check(/const code = \(error as \{ code\?: string \}\)\.code[\s\S]*PGRST204[\s\S]*42703/.test(sb), 'the read logs PGRST204 and 42703 distinguishably and returns []')
  check(/export const OCCUPYING_STATUSES = \['pending', 'confirmed', 'modified', 'cooking'\] as const/.test(sb), "OCCUPYING_STATUSES = ['pending','confirmed','modified','cooking']")
  check(/\.in\('status', \[\.\.\.OCCUPYING_STATUSES\]\)/.test(sb), 'the reservation read filters on exactly that set')
  const bu = sb.match(/\.in\('status', \['pending', 'confirmed', 'modified', 'cooking'\]\)/g) || []
  check(bu.length >= 2, `buildUnitsFromOrders and its sibling use the same literal (${bu.length} sites) — R3`)
  check(/const OCCUPYING_STATUSES = new Set\(\['pending', 'confirmed', 'modified', 'cooking'\]\)/.test(read('lib/capacity-breach.ts')), 'detectCapacityBreaches uses the same set')
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ writers proven'}`)
process.exit(fails ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
