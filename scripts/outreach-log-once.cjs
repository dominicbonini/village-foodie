#!/usr/bin/env node
// scripts/outreach-log-once.cjs
//
// Proof for item 1: two rapid presses of "Log" produce exactly ONE contact, and a failed log leaves the
// compose window open. (components/admin/ComposeWindow.tsx, `logNow`.)
//
// 🔴 WHAT A FAILURE LOOKS LIKE: two contact rows for one message. 🧪 The reference manual records this
// happening for real — two contacts 0.755s apart, from this exact function — and the consequence is not
// cosmetic: `nextStep` derives the rung ladder from contact rows, so a duplicate can advance a prospect
// a whole rung and send them a chase they should not get.
//
// ⚠️ WHAT THIS PROVES, STATED HONESTLY. `logNow` is a closure inside a React component and this repo has
// no test renderer, so the BEHAVIOURAL half below runs a MODEL of the guard sequence. On its own a model
// proves only that the model is consistent. The SOURCE half therefore pins that the real function has
// the ref gate, in the right order, released in a `finally` — so the model and the code cannot drift.
// A model without the source assertions would be theatre; both halves are required.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const SRC = fs.readFileSync(path.join(REPO, 'components/admin/ComposeWindow.tsx'), 'utf8')

/** The implemented sequence: a synchronous ref claimed before any await, released in `finally`. */
function makeLogger({ onLogResult, throws = false }) {
  const state = { logging: false, logged: false, closed: false, error: null, calls: 0 }
  const ref = { current: false }                 // 🔴 the ref — written and read in the same tick
  const logNow = async () => {
    if (ref.current) return                      // synchronous gate, FIRST
    if (state.logging || !'body'.trim()) return  // the pre-existing state guard, kept
    ref.current = true
    state.logging = true
    let ok = false
    try {
      state.calls++
      if (throws) throw new Error('network')
      ok = await onLogResult()
    } catch { ok = false } finally {
      ref.current = false
      state.logging = false
    }
    if (ok) { state.logged = true; state.closed = true }
    else state.error = 'shown'
    return ok
  }
  return { state, logNow }
}

/**
 * The PRE-FIX sequence: React STATE only, faithfully modelled.
 * 🔴 THE FIDELITY IS THE WHOLE POINT, AND THE FIRST VERSION OF THIS VARIANT WAS WRONG. It wrote
 * `state.logging = true` synchronously, which BLOCKS the second call — so the variant passed the
 * double-press assertion and was only caught on incidental differences. That is precisely the
 * "green proof that proves nothing" this harness exists to avoid, so it is recorded rather than
 * quietly corrected.
 * ⚠️ React's `setLogging(true)` does NOT update the value the current closure reads. Two handlers
 * firing in the same tick both read the PRE-update value. That is modelled by deferring the write to a
 * microtask, which is what makes both callers get past the guard — the real defect.
 */
function makeLoggerStateOnly({ onLogResult, throws = false }) {
  const state = { logging: false, logged: false, closed: false, error: null, calls: 0 }
  const logNow = async () => {
    if (state.logging) return                    // reads the value as of THIS tick
    Promise.resolve().then(() => { state.logging = true })   // ⚠️ async, exactly like setState
    let ok = false
    try {
      state.calls++
      if (throws) throw new Error('network')
      ok = await onLogResult()
    } catch { ok = false } finally {
      state.logging = false
    }
    if (ok) { state.logged = true; state.closed = true }
    else state.error = 'shown'
    return ok
  }
  return { state, logNow }
}

async function runSuite(make) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)

  // 🔴 TWO PRESSES IN THE SAME TICK — the real double-click, not two awaited calls.
  {
    const { state, logNow } = make({ onLogResult: async () => { await new Promise(r => setTimeout(r, 5)); return true } })
    await Promise.all([logNow(), logNow()])
    t('🔴 two rapid presses produce EXACTLY ONE log', state.calls === 1)
    t('the window closes on success', state.closed === true)
  }
  // A failed log keeps the window open and shows the error.
  {
    const { state, logNow } = make({ onLogResult: async () => false })
    await logNow()
    t('🔴 a FAILED log leaves the window OPEN', state.closed === false)
    t('a failed log shows an error', state.error === 'shown')
    t('a failed log does not mark itself logged', state.logged === false)
  }
  // A THROWN log must release the guard, or the button is dead for the life of the window.
  {
    const { state, logNow } = make({ onLogResult: async () => true, throws: true })
    await logNow()
    const second = await logNow()
    t('🔴 a THROWN log releases the guard (a retry is possible)', state.calls === 2 || second !== undefined)
    t('a thrown log leaves the window open', state.closed === false)
  }
  return { ok, fails }
}

;(async () => {
  console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
  const broken = await runSuite(makeLoggerStateOnly)
  const detected = broken.fails.length > 0
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 React state only, no ref (the shipped defect)`)
  for (const f of broken.fails) console.log(`        caught: ${f}`)
  if (!detected) { console.log('\n🔴 THE VARIANT PASSED.'); process.exit(1) }

  console.log('\n── THE REAL SEQUENCE (MODEL) ───────────────────────────────────────────────────────────')
  const r = await runSuite(makeLogger)
  for (const n of r.ok) console.log('  ✓ ' + n)
  for (const n of r.fails) console.log('  🔴 ' + n)

  console.log('\n── THE REAL SOURCE (what makes the model binding) ──────────────────────────────────────')
  const checks = [
    ['a ref exists and starts false', /const logInFlight = useRef\(false\)/.test(SRC)],
    ['🔴 the ref gate is the FIRST statement after setPending', /setPending\(null\)\s*\n(?:\s*\/\/[^\n]*\n)*\s*if \(logInFlight\.current\) return/.test(SRC)],
    ['the pre-existing guards still run before the write', /if \(logging \|\| !body\.trim\(\)\) return/.test(SRC) && /if \(refusal\) \{ setSendError\(refusal\); return \}/.test(SRC)],
    ['🔴 the refusal guard runs BEFORE the ref is claimed (a refusal must not lock the button)',
      SRC.indexOf('if (refusal) { setSendError(refusal); return }') < SRC.indexOf('logInFlight.current = true')],
    ['🔴 the ref is released in a finally', /\} finally \{[\s\S]{0,200}?logInFlight\.current = false/.test(SRC)],
    ['🔴 onClose() is called on success', /if \(ok\) \{[\s\S]{0,900}?onClose\(\)/.test(SRC)],
    ['the button is disabled while logging', /disabled=\{logging \|\| logged \|\| !body\.trim\(\)\}/.test(SRC)],
    ['🔴 nothing is merged by hand — the panel re-reads via load()', /logContact[\s\S]*?await load\(\)/.test(fs.readFileSync(path.join(REPO, 'components/admin/OutreachPanel.tsx'), 'utf8'))],
  ]
  const sf = []
  for (const [n, okk] of checks) { if (!okk) sf.push(n); console.log(`  ${okk ? '✓' : '🔴'} ${n}`) }

  const fails = r.fails.concat(sf)
  console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ all ' + (r.ok.length + checks.length) + ' passed'}`)
  process.exit(fails.length ? 1 : 0)
})()
