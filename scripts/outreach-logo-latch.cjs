#!/usr/bin/env node
// scripts/outreach-logo-latch.cjs
//
// Item 6 / round 3: the thumbnail error latch now CLEARS ON A REFRESH, and the deliberate parts stay.
//
// 🔴 WHAT A FAILURE LOOKS LIKE: the logo is still hidden after `load()` returns the same URL — i.e. the
// round-2 defect is back, and a single transient image failure again hides a logo until the page is
// reloaded. Or the opposite failure: the ⚠ marker stops appearing after a REAL failure, which would turn
// a broken value into an inviting empty slot — the behaviour the surrounding comments exist to protect.
//
// ⚠️ THIS MODELS THE THUMB'S STATE MACHINE. This repo has no test renderer, so the behavioural half is a
// model; the SOURCE assertions below pin that both real thumbs read the nonce through the one shared
// hook, so the model and the code cannot drift. A model alone would be theatre.

const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const SRC = fs.readFileSync(path.join(REPO, 'components/admin/OutreachPanel.tsx'), 'utf8')

/** The thumb, as implemented: `broken` resets only on a CHANGE of `value`. */
function makeThumb(resetsOn = 'value') {
  return {
    value: null, broken: false, mounted: false,
    mount(v) { this.value = v; this.broken = false; this.mounted = true },
    /** A re-render with a (possibly identical) value — what `load()` produces. */
    receive(v, refreshNonce) {
      const changed = resetsOn === 'value' ? v !== this.value
                                           : (v !== this.value || refreshNonce !== this.nonce)
      this.value = v; this.nonce = refreshNonce
      if (changed) this.broken = false          // the useEffect
    },
    imgFailsToLoad() { this.broken = true },     // onError
    get logoVisible() { return !!this.value && !this.broken },
  }
}

const LIVE_URL = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/' +
                 'fc15d42b-2e2d-45ad-bf2a-711485954d9b/logos/1789489057229-pigcasso.png'

/**
 * The thumb's state machine.
 * @param resetsOn 'value'        — the ROUND-2 BEHAVIOUR (the broken variant)
 *                 'value+refresh' — the implemented fix (useThumbLatch)
 */
function makeThumb(resetsOn) {
  return {
    value: null, nonce: 0, broken: false, warnings: 0,
    mount(v, n) { this.value = v; this.nonce = n; this.broken = false },
    /** A re-render. `nonce` changes only when load() SUCCEEDS. */
    receive(v, n) {
      const changed = resetsOn === 'value' ? v !== this.value : (v !== this.value || n !== this.nonce)
      this.value = v; this.nonce = n
      if (changed) this.broken = false
    },
    imgFailsToLoad() { this.broken = true; this.warnings++ },   // onError → setBroken + one console.warn
    get logoVisible() { return !!this.value && !this.broken },
    get warningShown() { return !!this.value && this.broken },  // the ⚠ marker, never an empty slot
  }
}

function runSuite(resetsOn) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)
  const th = makeThumb(resetsOn)

  th.mount(LIVE_URL, 1)
  t('mount — the logo renders', th.logoVisible === true)

  th.imgFailsToLoad()
  t('🔴 a transient failure shows the ⚠ marker, never an empty slot', th.warningShown === true && th.logoVisible === false)
  t('the failure is logged exactly once', th.warnings === 1)

  // An action → load() succeeds → the nonce changes, the URL does not.
  th.receive(LIVE_URL, 2)
  t('🔴 after load() with the IDENTICAL url — VISIBLE AGAIN', th.logoVisible === true)

  // 🔴 NO RETRY LOOP: a re-render that is NOT a successful refresh must not clear anything.
  th.imgFailsToLoad()
  th.receive(LIVE_URL, 2)          // same nonce — a plain re-render, e.g. a filter change
  t('🔴 a re-render WITHOUT a refresh does NOT clear the latch (no retry loop)', th.logoVisible === false)
  t('   …and the ⚠ is still shown', th.warningShown === true)

  // A value that fails again after a refresh latches again.
  th.receive(LIVE_URL, 3)
  t('a refresh gives it one fresh attempt', th.logoVisible === true)
  th.imgFailsToLoad()
  t('🔴 a value that fails AGAIN latches again and shows ⚠', th.warningShown === true && th.logoVisible === false)
  t('at most one attempt per refresh (2 failures over 3 refreshes)', th.warnings === 3)

  return { ok, fails }
}

console.log('── BROKEN VARIANT: the ROUND-2 latch (resets on `value` only) MUST FAIL ───────────────')
{
  const r = runSuite('value')
  const detected = r.fails.length > 0
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 reset keyed on [value] only`)
  for (const f of r.fails) console.log(`        caught: ${f}`)
  if (!detected) { console.log('\n🔴 THE VARIANT PASSED.'); process.exit(1) }
}

console.log('\n── THE REAL BEHAVIOUR (value + refreshNonce) ───────────────────────────────────────────')
const r = runSuite('value+refresh')
for (const n of r.ok) console.log('  ✓ ' + n)
for (const n of r.fails) console.log('  🔴 ' + n)

console.log('\n── THE SOURCE: both thumbs read the nonce, through ONE shared hook ──────────────────────')
const checks = [
  ['🔴 the shared hook resets on [value, refreshNonce]', /useEffect\(\(\) => \{ setBroken\(false\) \}, \[value, refreshNonce\]\)/.test(SRC)],
  ['there is ONE latch implementation, not two', (SRC.match(/const \[broken, setBroken\] = useState\(false\)/g) || []).length === 1],
  ['MediaCell uses the shared hook', /const \{ broken, onError: onThumbError \} = useThumbLatch\(\{\s*\n?\s*value, src, refreshNonce, kind, name: p\.name,/.test(SRC)],
  ['ModalThumb uses the shared hook', /const \{ broken, onError: onThumbError \} = useThumbLatch\(\{ value, src, refreshNonce, kind: label, name \}\)/.test(SRC)],
  ['both <img> elements call the hook\'s onError', (SRC.match(/onError=\{onThumbError\}/g) || []).length === 2],
  ['🔴 load() bumps the nonce, and only after a successful read', /setRefreshNonce\(x => x \+ 1\)/.test(SRC)
     && SRC.indexOf('setProspects(data.prospects || [])') < SRC.indexOf('setRefreshNonce(x => x + 1)')],
  ['the nonce reaches the row through a prop (Row is memo-wrapped)', /refreshNonce=\{refreshNonce\}/.test(SRC)],
  ['🔴 the onError warning carries the prefix, kind, name, src and an ISO timestamp',
    /console\.warn\(`\[outreach-thumb\] \$\{kind\} failed to load for \$\{name\} — src=\$\{src \?\? ''\} at \$\{new Date\(\)\.toISOString\(\)\}`\)/.test(SRC)],
  ['🔴 NO cache-buster was added to the src', !/\?t=|&t=|cacheBust|Date\.now\(\)\}`/.test(SRC.slice(SRC.indexOf('function useThumbLatch'), SRC.indexOf('function MediaCell')))],
]
const sf = []
for (const [n, okk] of checks) { if (!okk) sf.push(n); console.log(`  ${okk ? '✓' : '🔴'} ${n}`) }

const fails = r.fails.concat(sf)
console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ all ' + (r.ok.length + checks.length) + ' passed'}`)
process.exit(fails.length ? 1 : 0)
