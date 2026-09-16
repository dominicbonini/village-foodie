#!/usr/bin/env node
// scripts/whatsapp-setup-machine-harness.cjs
//
// Proofs for the WhatsApp Set up button's state machine (lib/whatsapp/setup-machine.ts).
//   node scripts/whatsapp-setup-machine-harness.cjs
//
// 🔴 THE HARNESS TAKES THE REDUCER AS AN ARGUMENT. It is run first against four deliberately broken
// variants, each of which MUST make it report FAILURE, and only then against the real reducer. A harness
// that imports the thing it tests can never be shown to detect anything.
//
// ⚠️ IT COMPILES THE TYPESCRIPT ITSELF into a temp directory using the repo's own tsc, so it needs no
// build step and no test framework — this repo has neither.
//
// 🔴 WHAT "A REQUEST" MEANS HERE. The reducer performs no I/O. The component POSTs to
// /api/manage/whatsapp-signup if and only if the reducer reports phase 'submitting'. So "did this event
// cause a request?" is exactly "did it produce 'submitting'?", and that is what the assertions test.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-setup-'))
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), [
  path.join(REPO, 'lib/whatsapp/setup-machine.ts'),
  '--module', 'commonjs', '--target', 'es2020', '--outDir', out, '--skipLibCheck',
], { stdio: 'pipe' })
const real = require(path.join(out, 'setup-machine.js'))

const { INITIAL_SETUP_STATE, CLOSED_NOTICE } = real
const S0 = INITIAL_SETUP_STATE

/** Drive a reducer through a list of events. */
const drive = (reducer, events, from = S0) => events.reduce((s, e) => reducer(s, e), from)

function runSuite(reducer, label) {
  const ok = [], fails = []
  const t = (name, cond) => (cond ? ok : fails).push(name)

  // ── idle -> preparing -> ready ───────────────────────────────────────────────────────────────────
  t('starts in preparing, button disabled', S0.phase === 'preparing')
  const ready = reducer(S0, { type: 'sdk_ready' })
  t('preparing + sdk_ready -> idle (ready to press)', ready.phase === 'idle')
  const unavailable = reducer(S0, { type: 'sdk_failed', message: 'blocked' })
  t('preparing + sdk_failed -> unavailable, reason shown',
    unavailable.phase === 'unavailable' && unavailable.notice && unavailable.notice.text === 'blocked')
  t('a click while preparing does nothing', reducer(S0, { type: 'clicked' }).phase === 'preparing')

  // ── click -> waiting ─────────────────────────────────────────────────────────────────────────────
  const waiting = drive(reducer, [{ type: 'sdk_ready' }, { type: 'clicked' }])
  t('click -> waiting', waiting.phase === 'waiting')
  t('click issues attempt 1', waiting.attempt === 1 && waiting.lastAttempt === 1)
  t('click makes NO request', waiting.phase !== 'submitting')
  t('a second click while waiting is ignored',
    reducer(waiting, { type: 'clicked' }).attempt === 1)

  // ── waiting + closed -> idle WITH the existing message ───────────────────────────────────────────
  const closed = reducer(waiting, { type: 'window_closed', attempt: 1 })
  t('waiting + closed -> idle', closed.phase === 'idle')
  t('waiting + closed shows the EXISTING message',
    !!closed.notice && closed.notice.text === CLOSED_NOTICE.text)
  t('🔴 waiting + closed makes NO request', closed.phase !== 'submitting')

  // ── waiting + Start again -> idle, no request, nothing alarming ──────────────────────────────────
  const again = reducer(waiting, { type: 'start_again' })
  t('🔴 waiting + Start again -> idle', again.phase === 'idle')
  t('🔴 waiting + Start again makes NO request', again.phase !== 'submitting')
  t('🔴 Start again shows nothing alarming (no notice at all)', again.notice === null)
  t('Start again retires the live attempt', again.attempt === null)
  t('Start again keeps the counter, so a late event is recognisably stale', again.lastAttempt === 1)
  t('Start again clears the pop-up hint', again.showPopupHint === false)

  // ── waiting + 20s -> hint shown, STILL waiting ───────────────────────────────────────────────────
  const ticked = reducer(waiting, { type: 'waited_20s', attempt: 1 })
  t('🔴 waiting + 20s -> hint shown', ticked.showPopupHint === true)
  t('🔴 waiting + 20s is STILL waiting (no abandonment)', ticked.phase === 'waiting')
  t('waiting + 20s keeps the attempt live', ticked.attempt === 1)
  t('the 20s tick ADDS, it does not replace: no notice is set', ticked.notice === null)

  // ── superseded attempt ───────────────────────────────────────────────────────────────────────────
  // After Start again, attempt 1 is retired. Anything arriving for it is stale.
  const staleClosed = reducer(again, { type: 'window_closed', attempt: 1 })
  t('🔴 superseded attempt + closed -> IGNORED (state unchanged)',
    staleClosed.phase === 'idle' && staleClosed.notice === null)
  const staleTick = reducer(again, { type: 'waited_20s', attempt: 1 })
  t('superseded attempt + 20s -> ignored', staleTick.showPopupHint === false)
  const staleErr = reducer(again, { type: 'window_error', attempt: 1, message: 'x' })
  t('superseded attempt + error -> ignored', staleErr.notice === null)

  // 🔴 …BUT A SUCCESS IS NEVER DROPPED.
  const staleSuccess = reducer(again, { type: 'succeeded', attempt: 1 })
  t('🔴 superseded attempt + SUCCESS -> PROCESSED (submitting)', staleSuccess.phase === 'submitting')
  t('🔴 …and it carries the attempt it belonged to', staleSuccess.attempt === 1)

  // ── waiting + success -> submitting ──────────────────────────────────────────────────────────────
  const submitting = reducer(waiting, { type: 'succeeded', attempt: 1 })
  t('waiting + success -> submitting', submitting.phase === 'submitting')
  const done = reducer(submitting, { type: 'submit_finished', notice: { tone: 'ok', text: 'Setup finished.' } })
  t('submitting + finished -> idle with the outcome', done.phase === 'idle' && done.notice.text === 'Setup finished.')

  // ── a second attempt gets a new id, so the first cannot speak for it ─────────────────────────────
  const second = drive(reducer, [{ type: 'clicked' }], again)
  t('a second click issues attempt 2', second.attempt === 2)
  t('🔴 attempt 1 closing cannot end attempt 2',
    reducer(second, { type: 'window_closed', attempt: 1 }).phase === 'waiting')

  return { label, ok, fails }
}

// ── THE BROKEN VARIANTS ─────────────────────────────────────────────────────────────────────────────
const R = real.setupReducer
const V1 = (s, e) => e.type === 'start_again' ? s : R(s, e)                      // Start again does nothing
const V2 = (s, e) => (e.type === 'start_again' || e.type === 'window_closed')    // …triggers a request
  ? { ...s, phase: 'submitting' } : R(s, e)
const V3 = (s, e) => (e.type === 'succeeded' && s.attempt !== e.attempt)         // stale success dropped
  ? s : R(s, e)
const V4 = (s, e) => e.type === 'waited_20s'                                     // the tick gives up
  ? { ...s, phase: 'idle', attempt: null, notice: { tone: 'warn', text: 'Timed out.' } } : R(s, e)

console.log('── BROKEN VARIANTS: each MUST report FAILURE ───────────────────────────────────────────')
let allFailed = true
for (const [name, impl] of [
  ['V1 Start again leaves the state in waiting', V1],
  ['V2 Start again / closed triggers a request', V2],
  ['V3 a success from a superseded attempt is dropped', V3],
  ['V4 the 20-second tick abandons the attempt', V4],
]) {
  const r = runSuite(impl, name)
  const detected = r.fails.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${name}`)
  for (const f of r.fails.slice(0, 2)) console.log(`        caught: ${f}`)
  if (r.fails.length > 2) console.log(`        …and ${r.fails.length - 2} more`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED. The harness is abandoned.'); process.exit(1) }

console.log('\n── THE REAL REDUCER ────────────────────────────────────────────────────────────────────')
const r = runSuite(R, 'real')
for (const n of r.ok) console.log('  ✓ ' + n)
for (const n of r.fails) console.log('  🔴 ' + n)
console.log(`\n${r.fails.length ? '🔴 ' + r.fails.length + ' FAILED' : '✅ all ' + r.ok.length + ' passed'}`)
fs.rmSync(out, { recursive: true, force: true })
process.exit(r.fails.length ? 1 : 0)
