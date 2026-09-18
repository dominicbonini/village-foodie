#!/usr/bin/env node
// scripts/ready-press-one-press.cjs — a Ready press must not claim the server is unreachable, and an
// application error must not borrow a connectivity error's words.
//   node scripts/ready-press-one-press.cjs      (≈ 15 s: one compile, one real 4-second email defer)
//
// 🔴 FAILURE MODE (Dominic, 19 September 2026, test-truck, "Bures Music Festival", localhost):
//   every press of Ready — and, he added mid-investigation, every order placed — briefly showed the
//   header "Can't reach the server. Showing orders from HH:MM. New orders may be missing.", which
//   cleared itself a few seconds later. The order advanced correctly. The server was never unreachable.
//
// THE SEQUENCE THAT PRODUCED IT:
//   1. the action writes an `orders` row → Postgres realtime fires → the client starts dashboard read A;
//   2. the action's POST returns and its own refetch SUPERSEDES: it aborts A and starts read B, so the
//      operator's own action is never the thing that gets discarded (added 18 September to stop a
//      post-cancel refetch being dropped — docs/add-order-refresh-review-report.md);
//   3. read A's catch saw `signal.aborted` and could not tell OUR OWN deliberate abort from the
//      READ_TIMEOUT_MS abort, because both reject the same signal with the same DOMException. It raised
//      the degraded banner;
//   4. read B succeeded and cleared it. Hence "flashes, then clears itself".
// The completion-presses setting is NOT in that sequence — see the report; it is a coincidence of
// timing, and this harness asserts the press is byte-identical under both settings.
//
// HOW: the rules now live in lib/dashboard-read.ts and are driven here for real. The press sequence is
// driven through the REAL lib/native/useGatedActionResult.tsx and lib/useReadyEmailUndo.ts on
// scripts/_mini-dom.cjs, with `fetch` recording every request, so "exactly these requests" is observed
// rather than asserted from reading the source.
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { installMocks } = require('./_printing-mocks.cjs'); const { installMiniDom } = require('./_mini-dom.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CONNECTIVITY = "Can't reach the server."
const LAST_REFRESH = new Date('2026-09-18T13:30:00Z')

function buildTree(root, tag) {
  const c = compile(root, ['lib/dashboard-read.ts', 'lib/native/useGatedActionResult.tsx', 'lib/useReadyEmailUndo.ts'], tag, { jsx: 'react-jsx' })
  installMocks(c.out, { native: false })
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch {}
  return c
}

// ── THE READ SLOT: the real module, driven through the exact sequence a Ready press produces ────────
function runSlotScenarios(D, label) {
  const out = {}
  // 1. realtime starts read A; the operator's own refetch supersedes it.
  let slot = null
  check2(D.decideRead(slot, {}) === 'start', out, 'realtimeStarts')
  slot = { controller: new AbortController(), superseded: false }
  const pollDecision = D.decideRead(slot, {})                       // the 60s poll, while A runs
  const opDecision = D.decideRead(slot, { supersede: true })        // the action's own refetch
  if (opDecision === 'supersede') { slot.superseded = true; slot.controller.abort() }
  const aFailure = D.classifyReadFailure({ aborted: slot.controller.signal.aborted, superseded: slot.superseded })
  const afterA = D.nextDegraded(null, aFailure, new Date())
  out.pollDecision = pollDecision; out.opDecision = opDecision
  out.supersededKind = aFailure.kind
  out.bannerAfterSupersede = D.degradedBanner(afterA, LAST_REFRESH)
  // 2. a genuine network failure: fetch threw, no status, no abort.
  out.offlineBanner = D.degradedBanner(D.nextDegraded(null, D.classifyReadFailure({ aborted: false, superseded: false }), new Date()), LAST_REFRESH)
  // 3. the read timed out: aborted, but nothing superseded it.
  out.timeoutBanner = D.degradedBanner(D.nextDegraded(null, D.classifyReadFailure({ aborted: true, superseded: false }), new Date()), LAST_REFRESH)
  // 4. the server ANSWERED, with an error.
  out.serverErrorBanner = D.degradedBanner(D.nextDegraded(null, D.classifyReadFailure({ aborted: false, superseded: false, status: 500 }), new Date()), LAST_REFRESH)
  void label
  return out
}
function check2(ok, bag, key) { bag[key] = ok }

// ── THE PRESS: the real post-action handler and the real ready-email machinery ──────────────────────
const React = require('react'); const { act } = React
const realError = console.error; console.error = (...a) => { if (/not wrapped in act/.test(String(a[0]))) return; realError(...a) }
const { createRoot } = require('react-dom/client')

/** One Ready press, end to end, recording every request it causes. `presses` is the completion setting. */
async function readyPress(tree, presses) {
  const log = []
  global.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(String(init.body)) : null
    log.push({ url: String(url), method: (init && init.method) || 'GET', action: body && body.action, status: 200 })
    return { ok: true, status: 200, json: async () => ({ success: true }) }
  }
  const { useGatedActionResult } = tree.req('lib/native/useGatedActionResult.js')
  const { useReadyEmailUndo } = tree.req('lib/useReadyEmailUndo.js')
  const ORDER = { order_key: 'ok-1', id: '11', status: 'cooking', buzzer_number: null, items: [] }
  let handler = null
  function Probe() {
    const { scheduleReadyEmail, undoReady } = useReadyEmailUndo({
      token: 'tok', pin: '', showToast: () => {}, refetch: () => { log.push({ url: '/api/dashboard', method: 'GET', action: null, status: 200, tag: 'refetch' }) },
    })
    handler = useGatedActionResult({
      showToast: () => {}, findOrder: () => ORDER, refreshPendingStatus: () => {}, dropOverlayEntry: () => {},
      scheduleReadyEmail, undoReady, runAction: () => {},
      refetch: () => { log.push({ url: '/api/dashboard', method: 'GET', action: null, status: 200, tag: 'refetch' }) },
      setActionLoading: () => {},
    })
    return React.createElement('div', null, presses)
  }
  const dom = installMiniDom()
  // useReadyEmailUndo registers a beforeunload flush so a ready email is never lost to a closing tab.
  // The mini-DOM records listeners but never dispatches, which is exactly right here: the flush must not
  // fire, and its absence is what proves the press itself issues no extra request.
  if (!global.window) global.window = {}
  if (typeof global.window.addEventListener !== 'function') {
    global.window.addEventListener = () => {}; global.window.removeEventListener = () => {}
  }
  if (!global.navigator) global.navigator = {}
  const root = createRoot(dom.container)
  await act(async () => { root.render(React.createElement(Probe)) })
  // THE WRITE. This is the one line doAction fires — one POST, one action name, whatever the setting is.
  log.push({ url: '/api/dashboard/action', method: 'POST', action: 'ready', status: 200, tag: 'write' })
  await act(async () => { await handler({ ok: true, queued: false, data: {} }, 'ready', 'ok-1') })
  await act(async () => { await sleep(4400) })          // the REAL 4-second email defer, not mocked
  await act(async () => root.unmount()); dom.teardown()
  return log
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `rp-${tag}-`))
    for (const d of ['lib']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/dashboard-read.ts'); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return { tmp, D: compile(tmp, ['lib/dashboard-read.ts'], tag).req('lib/dashboard-read.js') }
  }
  {
    // V1 — THE PRE-FIX SEQUENCE. Before the fix there was no `superseded` flag to consult: every abort
    // was treated alike, so a read we deliberately replaced raised the degraded banner. The Ready press
    // must be observed producing "Can't reach the server".
    const v = variant('v1', src => src.replace(
      "  if (input.aborted) return input.superseded ? { kind: 'superseded' } : { kind: 'timeout' }",
      "  if (input.aborted) return { kind: 'timeout' }"))
    const r = runSlotScenarios(v.D, 'v1')
    const flashed = typeof r.bannerAfterSupersede === 'string' && r.bannerAfterSupersede.startsWith(CONNECTIVITY)
    console.log(`  ${flashed ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 pre-fix: a superseded read raised ${JSON.stringify(r.bannerAfterSupersede)}`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!flashed) process.exit(1)
  }
  {
    // V2 — THE ERROR SURFACE COLLAPSED. Both kinds share one sentence again, so a 500 from the backend
    // tells the operator to check a connection that is working perfectly.
    const v = variant('v2', src => src.replace(
      "  if (d.kind === 'server-error') {", "  if (false) {"))
    const r = runSlotScenarios(v.D, 'v2')
    const collapsed = typeof r.serverErrorBanner === 'string' && r.serverErrorBanner.startsWith(CONNECTIVITY)
    console.log(`  ${collapsed ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 one message for both kinds: a 500 reads ${JSON.stringify(r.serverErrorBanner)}`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!collapsed) process.exit(1)
  }

  const tree = buildTree(REPO, 'rpReal')
  const D = tree.req('lib/dashboard-read.js')

  console.log('\n── THE READ SLOT: A SUPERSEDED READ IS NOT A FAILURE ────────────────────────────────────')
  const r = runSlotScenarios(D, 'real')
  check(r.realtimeStarts, 'a realtime event starts a read when the slot is free')
  check(r.pollDecision === 'drop', `the 60-second poll is DROPPED while that read runs (decision: ${r.pollDecision})`)
  check(r.opDecision === 'supersede', `the action's own refetch SUPERSEDES it instead of being dropped (decision: ${r.opDecision})`)
  check(r.supersededKind === 'superseded', `the aborted read is classified '${r.supersededKind}', not 'timeout'`)
  check(r.bannerAfterSupersede === null, `and it raises NO banner: ${JSON.stringify(r.bannerAfterSupersede)}`)

  console.log('\n── THE TWO ERROR KINDS KEEP THEIR OWN WORDS ─────────────────────────────────────────────')
  check(r.offlineBanner.startsWith(CONNECTIVITY), `a genuine network failure still says: ${JSON.stringify(r.offlineBanner)}`)
  check(r.timeoutBanner.startsWith(CONNECTIVITY), `a read that timed out says the same: ${JSON.stringify(r.timeoutBanner)}`)
  check(!r.serverErrorBanner.startsWith(CONNECTIVITY) && /error 500/.test(r.serverErrorBanner),
    `an APPLICATION error says something else entirely: ${JSON.stringify(r.serverErrorBanner)}`)
  check(/New orders may be missing/.test(r.serverErrorBanner) && /New orders may be missing/.test(r.offlineBanner),
    'both still warn that the list may be INCOMPLETE — that half is the one that costs a customer their food')

  console.log('\n── THE READY PRESS, UNDER BOTH SETTINGS ─────────────────────────────────────────────────')
  const one = await readyPress(tree, 'one')
  const two = await readyPress(tree, 'two')
  const shape = l => l.map(e => `${e.method} ${e.url}${e.action ? ` [${e.action}]` : ''}`)
  const writes = l => l.filter(e => e.method === 'POST' && e.action === 'ready')
  console.log(`     one-press:  ${JSON.stringify(shape(one))}`)
  console.log(`     two-press:  ${JSON.stringify(shape(two))}`)
  check(JSON.stringify(shape(one)) === JSON.stringify(shape(two)),
    'the request sequence is IDENTICAL under one press and two presses')
  check(shape(one).join('|') === ['POST /api/dashboard/action [ready]', 'GET /api/dashboard', 'POST /api/dashboard/action [send_ready_email]'].join('|'),
    'exactly three requests: the write, the refetch, and the deferred ready email')
  check(writes(one).length === 1 && writes(two).length === 1,
    `no press produces two writes: ${writes(one).length} under one press, ${writes(two).length} under two`)
  check(one.every(e => e.status === 200) && two.every(e => e.status === 200),
    'and not one of them fails — there is no failing request in a Ready press under either setting')

  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ a superseded read is silent, the two error kinds keep their own words, and the press is unchanged by the setting')
  process.exit(fails ? 1 : 0)
})()
