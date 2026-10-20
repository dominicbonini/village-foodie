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
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): a demo truck is ON through its OVERRIDE, no longer through
// `plan === 'demo'` (no code names a plan). 20261024_plans.sql writes the override to every existing demo truck and
// lib/provision-truck.ts writes it for a new one — so a demo truck as it stands after the migration is this row.
const DEMO = { id: 'demo-…', plan: 'demo', feature_overrides: { batch_reservations: true } }
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
check(F.resolveBatchReservations(DEMO) === true, "a demo truck (plan 'demo', with the override the migration / provisioning writes) → ON")
check(F.resolveBatchReservations({ plan: 'demo', feature_overrides: {} }) === false, "the plan alone no longer switches it on — plan 'demo' with no override → OFF (Stage A)")
check(F.resolveBatchReservations({ plan: 'trial', feature_overrides: { batch_reservations: true } }) === true, "feature_overrides.batch_reservations: true → ON")
check(F.resolveBatchReservations({ plan: 'trial', feature_overrides: { batch_reservations: 'true' } }) === true, "…the jsonb text 'true' as well (->> compares text)")
check(F.resolveBatchReservations({ plan: 'trial', feature_overrides: { batch_reservations: false } }) === false && F.resolveBatchReservations({ plan: 'max', feature_overrides: null }) === false && F.resolveBatchReservations(null) === false, 'false / null overrides / no truck → OFF')
// the statement Dominic will run, simulated on test-truck's row: || preserves the existing key
const after = { ...TEST_TRUCK.feature_overrides, batch_reservations: true }
check(F.resolveBatchReservations({ plan: 'trial', feature_overrides: after }) === true && after.whatsapp_setup_preview === true, `after \`coalesce(feature_overrides,'{}') || '{"batch_reservations": true}'\`: ON, and whatsapp_setup_preview is preserved (${JSON.stringify(after)})`)
console.log('\n── it is NOT a plan feature ────────────────────────────────────────────────────────────')
{
  const src = fs.readFileSync(path.join(REPO, 'lib/features.ts'), 'utf8')
  /* ══ 🔴 THE SLICE IS THE UNION, AND IT IS STRIPPED OF COMMENTS (5 October 2026) ══════════════════
   * ⛔ IT USED TO BE `indexOf('export type Feature =') + 2000` — a CHARACTER COUNT, because the
   * intended end marker (`export type Plan`) sits at index 0, ABOVE the union, so the `> 0` test was
   * always false and the fallback was always taken. Two things then went wrong at once: the window
   * was arbitrary, and it was taken over the raw source.
   * 🔴 WHAT BROKE IT: `places_posts_preview` joined the union (5 October 2026) with a note explaining
   * why it is a `Feature` and not a second bespoke override key — a note that NAMES
   * `batch_reservations`. The assertion found the word in a COMMENT and reported the key as a plan
   * feature. This repository's recurring failure, in reverse: prose BREAKING a check about code.
   * ✅ SO THE END IS THE REAL ONE — `const PRO_FEATURES`, the first thing after the union — and the
   * comments go first. The claim is unchanged and is now about code. */
  // ⚠️ RE-PINNED (Stage A): PRO_FEATURES is gone; the union now ends at the canAccess doc comment.
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the Feature union is now DERIVED from the runtime
  // array `export const FEATURES = [ … ] as const` (`type Feature = (typeof FEATURES)[number]`), so the list to search
  // is that array — from its declaration to its `] as const` — and an entry reads `'qr_menu',`, not `| 'qr_menu'`.
  const unionStart = src.indexOf('export const FEATURES = [')
  const unionEnd = src.indexOf('] as const', unionStart)
  const featureUnion = src.slice(unionStart, unionEnd)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  check(unionStart >= 0 && unionEnd > unionStart && /'qr_menu',/.test(featureUnion) && /export type Feature = \(typeof FEATURES\)\[number\]/.test(src),
    'the Feature list (FEATURES, which the Feature type is derived from) is found, bounded by `] as const` — not by a character count')
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): FEATURES is a runtime array now, so the claim is
  // checked on the compiled module as well as on the source slice.
  check(!/batch_reservations/.test(featureUnion) && Array.isArray(F.FEATURES) && F.FEATURES.length > 0 && !F.FEATURES.includes('batch_reservations'),
    "'batch_reservations' is not in FEATURES (source or runtime) — canAccess never sees it")
  // ⚠️ RE-PINNED (Stage A): lib/plan-features.ts moved into the frozen display copy, lib/legacy-pricing-display.ts.
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the frozen copy is deleted; the plan table's rows now live in
  // lib/feature-table.ts (capabilities only, no plan) — so that is the matrix that must not name the switch.
  check(!fs.existsSync(path.join(REPO, 'lib/legacy-pricing-display.ts')) && !/batch_reservations/.test(fs.readFileSync(path.join(REPO, 'lib/feature-table.ts'), 'utf8')), 'and not in lib/feature-table.ts — the plan table rows (which replaced the frozen matrix) do not name it')
  for (const f of ['app/api/slots/[truckId]/route.ts', 'app/api/dashboard/route.ts', 'app/api/orders/submit/route.ts', 'lib/payments/promote-draft.ts', 'app/api/dashboard/action/route.ts'])
    check(/resolveBatchReservations\(truck/.test(fs.readFileSync(path.join(REPO, f), 'utf8')), `${f} resolves it from the truck row it already reads`)
  const slots = fs.readFileSync(path.join(REPO, 'app/api/slots/[truckId]/route.ts'), 'utf8')
  // Phase 2B added `timezone, country` (the truck's clock) — also columns that exist live (20261010_01 records
  // them as already there), so the 42703 argument holds for the whole list.
  check(/const cols = 'id, collection_interval_mins, slot_duration_mins, plan, feature_overrides, timezone, country'/.test(slots), '/api/slots names plan + feature_overrides (+ Phase 2B timezone, country) — EXISTING columns, so no surface can 42703 on them')
}
console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the switch resolves as decided; Gusto is OFF'}`)
process.exit(fails ? 1 : 0)
