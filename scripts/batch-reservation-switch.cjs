#!/usr/bin/env node
// scripts/batch-reservation-switch.cjs — the per-truck switch resolves as decided, and Gusto is OFF.
//   node scripts/batch-reservation-switch.cjs
// 🔴 FAILURE MODE: a live truck that never asked for the rule waking up ON — Gusto (plan 'trial',
// feature_overrides {}) most of all — or a demo truck OFF, or the switch read from anything but the
// truck row. Gusto's row shape below is a FIXTURE copied from the read-only SQL in the report.
const fs = require('fs'), path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const c = compile(REPO, ['lib/features.ts'], 'switch'); const F = c.req('lib/features.js')
let fails = 0; const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const GUSTO = { id: 'pizzeria-gusto', plan: 'trial', feature_overrides: {} }                // read-only SQL, 18 Sep 2026
const TEST_TRUCK = { id: 'test-truck', plan: 'trial', feature_overrides: { whatsapp_setup_preview: true } }
const DEMO = { id: 'demo-…', plan: 'demo', feature_overrides: {} }
console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1: a resolver that defaults ON for plan 'trial' (the "everyone on trial gets the new thing" mistake).
  const v1 = (t) => t.plan === 'demo' || t.plan === 'trial' || t.feature_overrides?.batch_reservations === true
  const bad = v1(GUSTO) === true
  console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 trial defaults ON: Gusto resolves ${v1(GUSTO) ? 'ON' : 'OFF'}`)
  if (!bad) process.exit(1)
}
console.log('\n── resolveBatchReservations ────────────────────────────────────────────────────────────')
check(F.resolveBatchReservations(GUSTO) === false, "Gusto (plan 'trial', feature_overrides {}) → OFF")
check(F.resolveBatchReservations(TEST_TRUCK) === false, "test-truck today (trial, whatsapp_setup_preview only) → OFF")
check(F.resolveBatchReservations(DEMO) === true, "a demo truck (plan 'demo') → ON")
check(F.resolveBatchReservations({ plan: 'trial', feature_overrides: { batch_reservations: true } }) === true, "feature_overrides.batch_reservations: true → ON")
check(F.resolveBatchReservations({ plan: 'trial', feature_overrides: { batch_reservations: 'true' } }) === true, "…the jsonb text 'true' as well (->> compares text)")
check(F.resolveBatchReservations({ plan: 'trial', feature_overrides: { batch_reservations: false } }) === false && F.resolveBatchReservations({ plan: 'max', feature_overrides: null }) === false && F.resolveBatchReservations(null) === false, 'false / null overrides / no truck → OFF')
// the statement Dominic will run, simulated on test-truck's row: || preserves the existing key
const after = { ...TEST_TRUCK.feature_overrides, batch_reservations: true }
check(F.resolveBatchReservations({ plan: 'trial', feature_overrides: after }) === true && after.whatsapp_setup_preview === true, `after \`coalesce(feature_overrides,'{}') || '{"batch_reservations": true}'\`: ON, and whatsapp_setup_preview is preserved (${JSON.stringify(after)})`)
console.log('\n── it is NOT a plan feature ────────────────────────────────────────────────────────────')
{
  const src = fs.readFileSync(path.join(REPO, 'lib/features.ts'), 'utf8')
  const featureUnion = src.slice(src.indexOf('export type Feature ='), src.indexOf('export type Plan') > 0 ? src.indexOf('export type Plan') : src.indexOf('export type Feature =') + 2000)
  check(!/batch_reservations/.test(featureUnion), "'batch_reservations' is not in the Feature union — canAccess never sees it")
  check(!/batch_reservations/.test(fs.readFileSync(path.join(REPO, 'lib/plan-features.ts'), 'utf8')), 'and not in lib/plan-features.ts — the plan matrix and its parity guard are untouched')
  for (const f of ['app/api/slots/[truckId]/route.ts', 'app/api/dashboard/route.ts', 'app/api/orders/submit/route.ts', 'lib/payments/promote-draft.ts', 'app/api/dashboard/action/route.ts'])
    check(/resolveBatchReservations\(truck/.test(fs.readFileSync(path.join(REPO, f), 'utf8')), `${f} resolves it from the truck row it already reads`)
  const slots = fs.readFileSync(path.join(REPO, 'app/api/slots/[truckId]/route.ts'), 'utf8')
  check(/const cols = 'id, collection_interval_mins, slot_duration_mins, plan, feature_overrides'/.test(slots), '/api/slots names plan + feature_overrides — EXISTING columns, so no surface can 42703 on them')
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the switch resolves as decided; Gusto is OFF'}`)
process.exit(fails ? 1 : 0)
