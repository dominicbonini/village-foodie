#!/usr/bin/env node
// scripts/batch-reservation-edit-lock.cjs — the edit action's per-event lock: ON only, once, always released.
//   node scripts/batch-reservation-edit-lock.cjs
//
// 🔴 FAILURE MODE: (1) an OFF truck (Pizzeria Gusto) paying for a lock it does not need — a
// booking_locks delete+insert+delete per edit and, under contention, up to LOCK_MAX_WAIT_MS of waiting —
// so the OFF edit flow is no longer HEAD's in timing; (2) a nested acquisition: acquireEventLock is NOT
// re-entrant (one booking_locks row per truck+date), so a second acquire by the same request spins to
// the deadline and returns {ok:false, reason:'contention'} — the edit stalls for the full budget.
//
// Two halves. STRUCTURE reads the real route text: exactly one acquire in the edit block, guarded by the
// switch, released in a finally, and no callee that can take the lock again. BEHAVIOUR compiles the real
// lib/stock-guard.ts against an in-memory booking_locks and shows what a nested acquire actually does.
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }

// ── the edit block, from the real file ───────────────────────────────────────────────────────────────
const ROUTE = path.join(REPO, 'app/api/dashboard/action/route.ts')
function editBlockOf(src) {
  const a = src.indexOf("if (action === 'edit')")
  const b = src.indexOf("if (action === '", a + 10)
  if (a < 0 || b < 0) throw new Error('edit block not found')
  return src.slice(a, b)
}
/** The structural checks. Returns the list of failures (empty = holds). */
const BUSY = "{ error: 'Someone else is updating orders right now. Please try again.', retry: true },\n          { status: 409 },"
function structure(block) {
  const out = []
  const acquires = (block.match(/acquireEventLock\(/g) || []).length
  if (acquires !== 1) out.push(`expected exactly ONE acquireEventLock in the edit block, found ${acquires}`)
  if (!/const editLock = editNeedsLock \? await acquireEventLock\(truck\.id, order\.event_date\) : null/.test(block))
    out.push('the acquire is not guarded by the switch (`editNeedsLock ? await acquireEventLock(…) : null`)')
  if (!/const editBatchOn = resolveBatchReservations\(truck\)/.test(block) || !/const editNeedsLock = editBatchOn && /.test(block))
    out.push('editNeedsLock is not derived from the truck row switch')
  if (!/finally \{ if \(editLock\?\.ok\) await releaseEventLock\(truck\.id, order\.event_date\) \}/.test(block))
    out.push('no `finally { if (editLock?.ok) await releaseEventLock(…) }`')
  // 19 September 2026: ORDER OF EVENTS. acquire → busy refusal → try { row update … re-booking } finally release.
  const acqAt = block.indexOf('await acquireEventLock('), busyAt = block.indexOf("if (editNeedsLock && !editLock?.ok)"), updAt = block.indexOf(".from('orders').update(")
  const tryAt = block.indexOf('try {', acqAt); const finAt = block.indexOf('} finally {', tryAt)
  if (acqAt < 0 || busyAt < 0 || updAt < 0) out.push('acquire / busy refusal / row update not all present')
  else {
    if (!(acqAt < busyAt && busyAt < updAt)) out.push('the lock is not taken BEFORE the row update (a busy edit would already be saved)')
    if (!(tryAt > busyAt && tryAt < updAt && finAt > updAt)) out.push('the row update is not inside the try that releases the lock')
    const refusal = block.slice(busyAt, block.indexOf('\n      }\n', busyAt))     // the whole `if (…) { return … }` statement
    if (!refusal.includes(BUSY)) out.push("the busy refusal is not the manual path's shape (409, { error, retry: true })")
    if (!/return NextResponse\.json\(/.test(refusal)) out.push('the busy refusal does not return')
  }
  if (tryAt < 0 || finAt < 0) out.push('the lock is not wrapped in try/finally')
  else if (/acquireEventLock\(/.test(block.slice(tryAt, finAt))) out.push('a NESTED acquireEventLock inside the try')
  return out
}
/** Every function called inside the try, and whether its module can take the lock. */
const CALLEE_MODULES = ['lib/slot-bookings.ts', 'lib/orders/cooking-reservation.ts', 'lib/orders/place-in-slot.ts', 'lib/slot-availability.ts', 'lib/slot-display.ts', 'lib/capacity-breach.ts', 'lib/features.ts']

const real = fs.readFileSync(ROUTE, 'utf8')
const block = editBlockOf(real)

console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
{
  // V3 (19 September 2026), FIRST: the body runs when the lock was not acquired — the busy refusal removed.
  const v3 = block.replace(/      if \(editNeedsLock && !editLock\?\.ok\) \{[\s\S]*?\{ status: 409 \},\n        \)\n      \}\n/, '')
  if (v3 === block) { console.log('🔴 V3 anchor not found'); process.exit(1) }
  const f3 = structure(v3)
  console.log(`  ${f3.length ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 the body runs when the lock was not acquired: ${f3[0] || ''}`)
  if (!f3.length) process.exit(1)
  // V1: the lock taken for EVERY truck — the first P3 build's mistake, in the new position.
  const v1 = block.replace('const editLock = editNeedsLock ? await acquireEventLock(truck.id, order.event_date) : null', 'const editLock = await acquireEventLock(truck.id, order.event_date)')
  const f1 = structure(v1)
  console.log(`  ${f1.length ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 lock taken with the switch OFF: ${f1[0] || ''}`)
  if (!f1.length) process.exit(1)
  // V2: a nested acquisition inside the try (before the re-admission).
  const v2 = block.replace('const rec = await admitForManual(', 'const inner = await acquireEventLock(truck.id, order.event_date)\n            const rec = await admitForManual(')
  const f2 = structure(v2)
  console.log(`  ${f2.length ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 nested acquisition: ${f2.find(x => /NESTED|exactly ONE/.test(x)) || f2[0]}`)
  if (!f2.length) process.exit(1)
}

console.log('\n── STRUCTURE: the real edit block ───────────────────────────────────────────────────────')
{
  const f = structure(block)
  check(f.length === 0, f.length ? f.join('; ') : 'exactly one acquire, guarded by the switch, released in a finally, nothing nested')
  const off = /const editLock = editNeedsLock \? await acquireEventLock/.test(block) && /if \(editNeedsLock && !editLock\?\.ok\)/.test(block)
  check(off, 'switch OFF ⇒ editNeedsLock false: no booking_locks write, no wait, no refusal, no release — the OFF flow is HEAD\'s')
  const manualBusy = real.slice(real.indexOf("if (!haveLock) {"), real.indexOf("if (!haveLock) {") + 260)
  check(/\{ error: '[^']+', retry: true \},\s*\{ status: 409 \}/.test(manualBusy) && block.includes(BUSY), "the edit's busy refusal has the manual path's status and shape (409, { error, retry: true })")
  const page = fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/page.tsx'), 'utf8')
  const submitEdit = page.slice(page.indexOf('const submitEdit=async'), page.indexOf('const updateStock=async'))
  check(/if\(res\.status===409&&data\?\.retry\)\{\s*showToast\(data\?\.error\|\|'Someone else is updating orders right now\. Please try again\.','error'\)\s*return\s*\}/.test(submitEdit), 'the dashboard shows that message and returns — the edit modal and its edits stay (no setEditingOrder(null), no fetchAll)')
  check(submitEdit.indexOf('data?.retry') < submitEdit.indexOf('if(!res.ok)throw'), '…and the branch sits before the generic throw, exactly where the Add Order panel handles the manual path\'s busy answer')
  for (const m of CALLEE_MODULES) {
    const src = fs.readFileSync(path.join(REPO, m), 'utf8')
    check(!/acquireEventLock/.test(src), `${m} never calls acquireEventLock (no nested acquisition through a callee)`)
  }
  const inTry = block.slice(block.indexOf('try {', block.indexOf('const editLock')), block.indexOf('} finally {'))
  const called = [...new Set((inTry.match(/await ([A-Za-z_]+)\(/g) || []).map(x => x.slice(6, -1)))]
  console.log(`  ℹ awaited inside the lock: ${called.join(', ')}`)
  check(called.every(fn => fn !== 'acquireEventLock'), 'none of them is acquireEventLock')
}

console.log('\n── BEHAVIOUR: the real acquireEventLock against an in-memory booking_locks ─────────────')
;(async () => {
  // Compile the real lib/stock-guard.ts into a temp dir, then stand in for its two DB-touching imports.
  const c = compile(REPO, ['lib/stock-guard.ts'], 'editlock')
  const write = (rel, body) => { const f = path.join(c.out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body) }
  // A booking_locks table: rows keyed truck_id|event_date with locked_at; the exact chains stock-guard uses.
  write('lib/supabase.js', `
    const rows = global.__locks = new Map(); const ops = global.__lockOps = []
    const chain = (op) => { const f = { truck: null, date: null, older: null }
      const q = { eq(k, v) { if (k === 'truck_id') f.truck = v; if (k === 'event_date') f.date = v; return q },
                  lt(k, v) { f.older = v; return q },
                  then(res) { const key = f.truck + '|' + f.date; ops.push(op)
                    if (op === 'delete') { const r = rows.get(key); if (r && (!f.older || r.locked_at < f.older)) rows.delete(key); return res({ error: null }) }
                    return res({ error: null }) } }
      return q }
    module.exports = { supabase: { from(t) { if (t !== 'booking_locks') throw new Error('unexpected table ' + t)
      return { delete: () => chain('delete'),
               insert(row) { ops.push('insert'); const key = row.truck_id + '|' + row.event_date
                 if (rows.has(key)) return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } })
                 rows.set(key, { locked_at: new Date().toISOString() }); return Promise.resolve({ error: null }) } } } } }`)
  write('lib/stock-availability.js', 'module.exports = { getLiveItemCounts: async () => ({}) }')
  const G = c.req('lib/stock-guard.js')
  const t0 = Date.now()
  const a = await G.acquireEventLock('test-truck', '2026-09-18')
  check(a.ok === true, `first acquire → ok (${Date.now() - t0} ms)`)
  const t1 = Date.now()
  const nested = await G.acquireEventLock('test-truck', '2026-09-18')      // what V2 would do at runtime
  const waited = Date.now() - t1
  check(nested.ok === false && nested.reason === 'contention', `a NESTED acquire while held → {ok:false, reason:'${nested.reason}'} after ${waited} ms (not re-entrant; LOCK_MAX_WAIT_MS = 3000)`)
  check(waited >= 2900 && waited < 4500, `…and it spins for the whole budget (${waited} ms): a V2 edit would stall ~3 s, then proceed unlocked`)
  await G.releaseEventLock('test-truck', '2026-09-18')
  const again = await G.acquireEventLock('test-truck', '2026-09-18')
  check(again.ok === true, 'after release, acquire → ok again')
  await G.releaseEventLock('test-truck', '2026-09-18')
  const ops = global.__lockOps
  // the nested attempt retried its insert every LOCK_RETRY_MS for the whole budget — that is the spin.
  const retries = ops.filter(o => o === 'insert').length - 2
  check(global.__locks.size === 0 && retries >= 15, `booking_locks: ${ops.length} ops, the nested attempt retried its insert ${retries}× (every 150 ms) — and the table is empty: every held lock was released`)
  // the ON edit shape: exactly one insert + one release even when the body throws (the finally).
  global.__lockOps.length = 0
  // The route's control flow, mirrored: acquire (ON) → busy ⇒ return the manual shape, nothing written →
  // else try { write; rebook } finally release. `writes` counts the row update the body would perform.
  const editShape = async (on, body) => { const needs = on; const lock = needs ? await G.acquireEventLock('t', 'd') : null
    if (needs && !lock?.ok) return { status: 409, body: { error: 'Someone else is updating orders right now. Please try again.', retry: true } }
    try { await body() } catch {} finally { if (lock?.ok) await G.releaseEventLock('t', 'd') }
    return { status: 200, body: { ok: true } } }
  let writes = 0
  await editShape(false, async () => { writes++ })
  check(global.__lockOps.length === 0 && writes === 1, 'OFF: zero booking_locks operations, the edit written (identical to HEAD)')
  global.__lockOps.length = 0; writes = 0
  const okRes = await editShape(true, async () => { writes++ })
  check(okRes.status === 200 && writes === 1 && global.__lockOps.filter(o => o === 'insert').length === 1 && global.__locks.size === 0, 'ON, lock available: one insert, the edit written once, released')
  global.__lockOps.length = 0; writes = 0
  await editShape(true, async () => { writes++; throw new Error('body failed') })
  check(global.__locks.size === 0 && writes === 1, 'ON, body throws: still released (finally)')
  // ON + the lock HELD BY ANOTHER REQUEST: the body must not run, the response is the busy shape, no write.
  global.__lockOps.length = 0; writes = 0
  const other = await G.acquireEventLock('t', 'd'); check(other.ok, 'another request holds the lock')
  const t2 = Date.now(); const busy = await editShape(true, async () => { writes++ })
  check(busy.status === 409 && busy.body.retry === true && busy.body.error === 'Someone else is updating orders right now. Please try again.', `ON, lock unavailable: 409 ${JSON.stringify(busy.body)} after ${Date.now() - t2} ms`)
  check(writes === 0, 'ON, lock unavailable: the edit body did NOT run — nothing written')
  check(global.__locks.size === 1, '…and the other request\'s lock was not released by the refused edit')
  await G.releaseEventLock('t', 'd')
  // BROKEN VARIANT of the behaviour, run here so the shape check above is not the only guard: a flow that
  // ignores `ok` runs the body under contention.
  const v3shape = async (on, body) => { const lock = on ? await G.acquireEventLock('t', 'd') : null; try { await body() } finally { if (lock?.ok) await G.releaseEventLock('t', 'd') } }
  const held = await G.acquireEventLock('t', 'd'); let v3writes = 0; await v3shape(true, async () => { v3writes++ }); await G.releaseEventLock('t', 'd')
  console.log(`  ${v3writes === 1 && held.ok ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 (behaviour) a flow that ignores ok: the body ran ${v3writes}× under contention`)
  if (!(v3writes === 1)) fails++
  console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the edit lock is taken only when ON, before any write, exactly once, always released — and a busy lock refuses with the manual path\'s answer'}`)
  process.exit(fails ? 1 : 0)
})()
