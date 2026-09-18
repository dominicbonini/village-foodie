#!/usr/bin/env node
// scripts/demo-welcome-open.cjs — opening a demo shows the introduction, every time the link is opened,
// and the signup prompt waits for an order the visitor actually placed.
//   node scripts/demo-welcome-open.cjs      (≈ 12 s: one compile, the real components on the mini-DOM)
//
// 🔴 FAILURE MODE (Dominic, 19 September 2026): he opened the Between Buns Royston demo and got NO
//    introduction — no full-screen welcome at all.
// TWO FAULTS, ONE SYMPTOM, both proven below:
//   1. `hg_demo_welcome_<token>` was keyed on the DASHBOARD TOKEN and stored in localStorage. A rebuild
//      keeps the token, so a flag set while checking the PREVIOUS build silenced the new one — for ever.
//   2. `DemoWelcome` read that flag in a `useState` initialiser, during first paint. The self-heal that
//      clears a stale flag runs in DemoLoopComplete's effect, gated on the orders fetch — always later.
//      The flag was cleared one render too late to be of any use, so the introduction appeared on the
//      NEXT load and never on the one that repaired it.
//
// HOW: the REAL DemoWelcome and DemoLoopComplete mounted on scripts/_mini-dom.cjs with a stand-in
// sessionStorage and localStorage, driven through the sequences a viewer actually performs. Nothing here
// touches the database or the network.
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { installMocks } = require('./_printing-mocks.cjs'); const { installMiniDom } = require('./_mini-dom.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const FILES = ['components/dashboard/DemoWelcome.tsx', 'components/dashboard/DemoLoopComplete.tsx', 'lib/demo-board-build.ts']
function buildTree(root, tag) {
  const c = compile(root, FILES, tag, { jsx: 'react-jsx' })
  installMocks(c.out, { native: false })
  // `installMocks` has already made a node_modules here, so the whole tree cannot be symlinked in. The two
  // packages DemoLoopComplete reaches through DemoGetStarted are stubbed instead — neither is exercised by
  // anything this harness asserts, and a stub keeps the compile honest about what the panels really import.
  const stub = (pkg, body) => {
    const d = path.join(c.out, 'node_modules', ...pkg.split('/'))
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, main: 'index.js' }))
    fs.writeFileSync(path.join(d, 'index.js'), body)
  }
  stub('@supabase/ssr', 'module.exports = { createBrowserClient: () => ({ auth: {}, from: () => ({}) }) }')
  return c
}

// ── the two browser stores, as a real browser scopes them ────────────────────────────────────────
function makeStores() {
  const local = new Map(), session = new Map()
  const face = m => ({
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
  })
  return { local, session, localStorage: face(local), sessionStorage: face(session) }
}
/** A NEW TAB: sessionStorage is empty, localStorage carries over. Exactly what opening the link again does. */
const newTab = stores => { stores.session.clear() }

const React = require('react'); const { act } = React
const realError = console.error; console.error = (...a) => { if (/not wrapped in act/.test(String(a[0]))) return; realError(...a) }
const { createRoot } = require('react-dom/client')

const TOKEN = 'demo-8c95xz1twsn1xfhx3a4nkjv7j3'
const SEEDED = ['seed-1', 'seed-2', 'seed-3']
const REBUILT = ['new-1', 'new-2', 'new-3']

/** Mount the two panels exactly as the dashboard mounts them, and report what a viewer would see. */
async function view(tree, stores, { orderKeys = SEEDED, isAdmin = false } = {}) {
  global.localStorage = stores.localStorage
  global.sessionStorage = stores.sessionStorage
  const { DemoWelcome } = tree.req('components/dashboard/DemoWelcome.js')
  const { DemoLoopComplete } = tree.req('components/dashboard/DemoLoopComplete.js')
  const dom = installMiniDom()
  if (!global.window) global.window = {}
  global.window.localStorage = stores.localStorage; global.window.sessionStorage = stores.sessionStorage
  if (typeof global.window.addEventListener !== 'function') { global.window.addEventListener = () => {}; global.window.removeEventListener = () => {} }
  const root = createRoot(dom.container)
  const orders = orderKeys.map((k, i) => ({ order_key: k, id: String(i + 1), status: 'confirmed', items: [] }))
  const Page = () => React.createElement(React.Fragment, null,
    // `orderUrl: null` keeps the QR's dynamic import out of the harness; it changes nothing this asserts.
    React.createElement(DemoWelcome, { token: TOKEN, orderUrl: null, isSample: false, logoUrl: null }),
    React.createElement(DemoLoopComplete, {
      token: TOKEN, orderKeys, orders, loaded: true, onHighlight: () => {}, isAdmin, extractionSource: null,
    }),
  )
  await act(async () => { root.render(React.createElement(Page)) })
  await act(async () => { await sleep(30) })
  const text = () => dom.container.textContent || ''
  const api = {
    dom, root,
    intro: () => /Here’s your menu|Here’s a sample truck/.test(text()),
    signup: () => /That’s exactly how a real order lands|That's exactly how a real order lands/.test(text()),
    dismiss: async () => {
      const btn = dom.container.all('button').find(b => /Got it|Start|Close|×/i.test(b.textContent || '') && b.reactProps?.onClick)
        || dom.container.all('button').find(b => b.reactProps?.onClick)
      if (!btn) throw new Error('no dismiss control on the welcome')
      await act(async () => { btn.reactProps.onClick({ stopPropagation() {}, preventDefault() {} }) })
      await act(async () => { await sleep(20) })
    },
    rerender: async (keys) => { await act(async () => { root.render(React.createElement(() => React.createElement(React.Fragment, null,
      React.createElement(DemoWelcome, { token: TOKEN, orderUrl: null, isSample: false, logoUrl: null }),
      React.createElement(DemoLoopComplete, { token: TOKEN, orderKeys: keys, orders: keys.map((k, i) => ({ order_key: k, id: String(i + 1), status: 'confirmed', items: [] })), loaded: true, onHighlight: () => {}, isAdmin, extractionSource: null }),
    ))) }); await act(async () => { await sleep(30) }) },
    unmount: async () => { await act(async () => root.unmount()); dom.teardown() },
  }
  return api
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dwo-${tag}-`))
    for (const d of ['components', 'lib']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, file); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return { tmp, tree: buildTree(tmp, tag) }
  }
  {
    // V1 — THE PRE-FIX KEYING: the seen-flag back in localStorage, read once in a useState initialiser.
    // A viewer who checked the PREVIOUS build then opens the rebuilt demo in a fresh tab and gets nothing.
    const v = variant('v1', 'lib/demo-board-build.ts', src => src
      .replace("  try { return sessionStorage.getItem(demoWelcomeKey(token)) === 'seen' } catch { return false }",
               "  try { return localStorage.getItem(demoWelcomeKey(token)) === 'seen' } catch { return false }")
      .replace("  try { sessionStorage.setItem(demoWelcomeKey(token), 'seen') } catch { /* private mode — it asks again */ }",
               "  try { localStorage.setItem(demoWelcomeKey(token), 'seen') } catch { /* private mode */ }"))
    const stores = makeStores()
    stores.local.set(`hg_demo_welcome_${TOKEN}`, 'seen')          // set while checking the previous build
    newTab(stores)                                               // …and now the link is opened afresh
    const m = await view(v.tree, stores)
    const silent = !m.intro()
    console.log(`  ${silent ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 the flag in localStorage: a new tab on a rebuilt demo shows ${silent ? 'NO introduction' : 'the introduction'}`)
    await m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true }); if (!silent) process.exit(1)
  }
  {
    // V2 — THE INTRODUCTION DEFERRED BEHIND THE SIGNUP PANEL: the deferral removed, so on a replaced board
    // the "real order lands" prompt speaks over an introduction the visitor has not read yet.
    const v = variant('v2', 'components/dashboard/DemoLoopComplete.tsx', src => src
      .replace('    if (!demoWelcomeSeen(token)) return', '    /* deferral removed */')
      .replace('    if (boardWasReplaced(baseline, keys)) {\n      resetDemoBoardFlags(token, keys)\n      return\n    }', '    /* self-heal removed */'))
    const stores = makeStores()
    stores.local.set(`hg_demo_seen_orders_${TOKEN}`, JSON.stringify(SEEDED))   // baseline from the old build
    const m = await view(v.tree, stores, { orderKeys: REBUILT })               // …a wholly new board
    const both = m.signup()
    console.log(`  ${both ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 deferral and self-heal removed: the signup prompt is on screen (${both}) over an unread introduction (${m.intro()})`)
    await m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true }); if (!both) process.exit(1)
  }

  const tree = buildTree(REPO, 'dwoReal')

  console.log('\n── OPENING THE LINK ─────────────────────────────────────────────────────────────────────')
  {
    const stores = makeStores()
    const m = await view(tree, stores)
    check(m.intro(), 'a browser with no flag opens on the introduction')
    check(!m.signup(), '…and the signup prompt is not on screen')
    await m.dismiss()
    check(!m.intro(), 'dismissing closes it')
    await m.unmount()
    // A RELOAD of the same tab: sessionStorage survives, so it must NOT reappear.
    const reload = await view(tree, stores)
    check(!reload.intro(), 'reloading that tab does NOT show it again — it is not on every page load')
    await reload.unmount()
    // OPENING THE LINK AGAIN, in a new tab: sessionStorage is gone, so it introduces itself again.
    newTab(stores)
    const again = await view(tree, stores)
    check(again.intro(), 'opening the demo link again in a new tab DOES show it again')
    check(stores.local.size === 0 || !stores.local.has(`hg_demo_welcome_${TOKEN}`),
      'and nothing durable was written — a check before sending leaves no "someone has seen it" behind')
    await again.unmount()
  }

  console.log('\n── A STALE FLAG FROM A PREVIOUS BUILD ───────────────────────────────────────────────────')
  {
    const stores = makeStores()
    stores.local.set(`hg_demo_welcome_${TOKEN}`, 'seen')                 // the pre-fix flag, still on disk
    stores.local.set(`hg_demo_seen_orders_${TOKEN}`, JSON.stringify(SEEDED))
    newTab(stores)
    const m = await view(tree, stores, { orderKeys: REBUILT })
    check(m.intro(), 'a localStorage flag left by the OLD build no longer suppresses the introduction')
    check(!m.signup(), '…and the rebuilt board does not fire the signup prompt')
    await m.unmount()
  }

  console.log('\n── A REBUILD DETECTED MID-SESSION ───────────────────────────────────────────────────────')
  {
    const stores = makeStores()
    const m = await view(tree, stores)                                   // open, read, dismiss
    await m.dismiss()
    check(!m.intro(), 'the introduction is dismissed for this session')
    await m.rerender(REBUILT)                                            // the board is replaced under them
    check(m.intro(), 'a rebuild detected in the SAME session re-opens the introduction immediately')
    check(!m.signup(), '…and still no signup prompt — those orders are not theirs')
    await m.unmount()
  }

  console.log('\n── THE SIGNUP PROMPT STILL WAITS FOR AN ORDER THEY PLACED ───────────────────────────────')
  {
    const stores = makeStores()
    const m = await view(tree, stores)
    await m.dismiss()
    check(!m.signup(), 'after the introduction, the seeded board alone shows no prompt')
    await m.rerender([...SEEDED, 'theirs-1'])                            // they order as a customer
    check(m.signup(), 'an order ADDED to the board they already knew DOES fire it — the moment it is for')
    await m.unmount()
  }

  console.log('\n── BOTH URLs REACH THE SAME PANEL ───────────────────────────────────────────────────────')
  {
    // /demo/<ref> is a 307 to /dashboard/<token> and nothing else, so the welcome cannot render on one and
    // not the other. Asserted from the route's own source rather than by guessing.
    const src = fs.readFileSync(path.join(REPO, 'app/demo/[ref]/route.ts'), 'utf8')
    const redirects = /NextResponse\.redirect\(new URL\(`\/dashboard\/\$\{truck\.dashboard_token\}`/.test(src)
    const writes = /\.(insert|update|upsert|delete)\(/.test(src)
    check(redirects, 'the prospect link /demo/<ref> resolves to /dashboard/<token> and redirects — one page, one panel')
    check(!writes, '…and writes nothing, so opening the link to check it consumes nothing')
  }

  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ the demo introduces itself whenever the link is opened, and only the visitor’s own order is congratulated')
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('HARNESS THREW', e); process.exit(1) })
