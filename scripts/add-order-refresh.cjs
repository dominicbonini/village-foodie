#!/usr/bin/env node
// scripts/add-order-refresh.cjs — the Add Order time list refreshes when capacity changes under it.
//   node scripts/add-order-refresh.cjs          (≈ 60 s: four real 5-second throttle windows, two compiles)
//
// 🔴 FAILURE MODE (Dominic, 17 September 2026, test-truck, "Rolling batch test", Not started): the
// dashboard was on Add Order with 7 pizzas; a CUSTOMER order for 7 @17:30 was placed in another tab; the
// dashboard refetched within a second, but the time list kept "17:30 🟢" — no count, no verdict
// — until the submit's own fresh re-check raised the popup. The list and the popup disagreed. Cause: the
// list reads `capacityInputs`, which prefers the panel's own /api/slots snapshot, and nothing invalidated
// that snapshot when the dashboard's data changed.
//
// HOW: the REAL component, mounted with react-dom/client on scripts/_mini-dom.cjs and kept mounted across
// re-renders, so state survives and effects run — which renderToString cannot do. `fetch` is a stub that
// counts /api/slots reads and answers with whatever board the scenario says the server holds. Handlers
// are called through the props React attached to the <select> (`__reactProps$…`), i.e. the exact
// functions React would call on a pointerdown.
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { installMocks } = require('./_printing-mocks.cjs')
const { installMiniDom } = require('./_mini-dom.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))
// 19 September 2026: a row now leads with the refusal marker — '✕ ' when this order cannot be ready by
// then, a same-width en space otherwise — so option text is matched after stripping it.
const stripMark = (t) => String(t || '').replace(/^[\u00d7\u2007]\u0020/, '')
const WINDOW_MS = 5000

// ── the module tree (as scripts/add-order-render.cjs builds it) ───────────────────────────────────
function buildTree(root, tag) {
  const c = compile(root, ['components/dashboard/AddOrderPanel.tsx', 'components/printing/PrintingSettings.tsx', 'components/printing/PrinterTypeChoice.tsx'], tag,
    { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false })
  installMocks(c.out, { native: false })
  const stub = (pkg, body) => { const d = path.join(c.out, 'node_modules', ...pkg.split('/')); fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, main: 'index.js' })); fs.writeFileSync(path.join(d, 'index.js'), body) }
  fs.mkdirSync(path.join(c.out, 'node_modules', 'next'), { recursive: true })
  fs.writeFileSync(path.join(c.out, 'node_modules', 'next', 'package.json'), JSON.stringify({ name: 'next' }))
  stub('next/navigation', 'module.exports = { useParams: () => ({ token: "tok" }), useRouter: () => ({ push(){}, replace(){} }), usePathname: () => "/" }')
  for (const pkg of ['@capacitor/network', '@capacitor/app', '@capacitor/local-notifications', '@capacitor/keep-awake', '@capacitor-community/keep-awake',
                     '@capacitor/status-bar', '@capacitor/push-notifications', '@aparajita/capacitor-biometric-auth', '@hatchgrab/net-printer'])
    stub(pkg, 'module.exports = new Proxy({}, { get: () => new Proxy(function(){}, { get: () => () => {}, apply: () => Promise.resolve({}) }) })')
  return c
}

// ── FIXTURE: test-truck, "Rolling batch test", Not started, 17:00–21:00, 15-minute grid, batch 8 / prep 15 ──
const PIZZA = { secs: 900, batch: 8 }
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const slotsFor = () => { const o = []; for (let m = 17 * 60; m <= 21 * 60; m += 15) o.push({ collection_time: fmt(m), production_slot: fmt(m), available: true, is_grace: false, is_past: false }); return o }
const EVENT = { id: 'ev-rolling', event_date: '2099-01-01', start_time: '17:00', end_time: '21:00', venue_name: 'Rolling batch test', status: 'not_started', van_id: null }
const MENU_ITEM = { id: 'i1', name: 'Margherita', price: 9, category: 'Pizza', is_available: true }
const EMPTY_BOARD = { units: {}, reservations: [] }
// the customer's 7 @17:30 — a fit under Dominic's rule: one window, 17:15–17:30, 7 of 8
const CUSTOMER_7 = { units: { '17:30': { pizza: 7 } }, reservations: [{ orderKey: 'cust-1', slot: '17:30', source: 'fit', cats: { pizza: { items: 7, batch: 8, prepMins: 15, windows: [{ startMins: 1035, endMins: 1050, items: 7 }] } } }] }
const capacityInputsFor = b => ({ productionSlotUnits: b.units, kitchenCapacity: null, capacityWindowMins: 5, intervalMins: 15, eventStartMins: 17 * 60, eventEndMins: 21 * 60,
  earliestCollectionMins: 0, date: EVENT.event_date, nowMins: 0, windowSecs: 0, reservations: b.reservations, batchReservations: true })
const slotsBody = b => ({ slots: slotsFor(), queueByCat: {}, capacityInputs: capacityInputsFor(b), catConfigs: { pizza: PIZZA }, tz: 'Europe/London' })
const offlineCapacityFor = b => ({ eventId: EVENT.id, slots: slotsFor(), productionSlotUnits: b.units, kitchenCapacity: null, intervalMins: 15, capacityWindowMins: 5,
  eventStartMins: 17 * 60, catConfigs: { pizza: PIZZA }, reservations: b.reservations, batchReservations: true })
const baseProps = (over = {}) => ({
  truck: { id: 'test-truck', name: 'Pizza Kitchen', plan: 'trial', feature_overrides: { batch_reservations: true }, trial_expires_at: null, slug: 'test-kitchen' },
  truckMenu: { items: [MENU_ITEM], categories: [{ id: 'c1', name: 'Pizza' }] }, menuGroups: { Pizza: [MENU_ITEM] },
  itemStocks: [], categoryStocks: [], categoryConfigs: { pizza: PIZZA }, categoryAllowNotes: { pizza: true },
  orders: [], waitMinutes: 10, token: 'fixture-token', pin: '', todayEvent: EVENT, categoryOrder: ['Pizza'], itemCategoryMap: { Margherita: 'Pizza' },
  showToast: () => {}, onOrderPlaced: () => {}, isOffline: false, offlineCapacity: offlineCapacityFor(EMPTY_BOARD), isEventLoaded: () => true,
  isActive: true, isDemo: false, buzzerCount: null, buzzerPromptEnabled: false, ...over,
})
const basket = n => [{ name: 'Margherita', quantity: n, unit_price: 9, cartKey: 'Margherita' }]

// ── the fetch stub: what the SERVER holds, and how many times the list asked ─────────────────────
const server = { board: EMPTY_BOARD, fail: false, slotsCalls: 0, log: [] }
global.fetch = async (url) => {
  const u = String(url)
  if (u.includes('/api/slots/')) {
    server.slotsCalls++; server.log.push(Date.now())
    if (server.fail) throw new TypeError('Failed to fetch')
    const body = slotsBody(server.board); return { ok: true, status: 200, json: async () => body }
  }
  if (u.includes('/api/events/manage')) return { ok: true, status: 200, json: async () => ({ events: [EVENT] }) }
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}

const React = require('react')
const { act } = React
// A background fetch resolving between two act() calls makes React print its "not wrapped in act(...)"
// advice. That is expected here — the refresher is fire-and-forget by design — and every assertion below
// re-enters act() before reading, so the advice is noise. Only that one message is filtered.
const realError = console.error
console.error = (...a) => { if (/not wrapped in act/.test(String(a[0]))) return; realError(...a) }
const { createRoot } = require('react-dom/client')
const settle = async () => { await act(async () => { await sleep(20) }); await act(async () => { await sleep(20) }) }
/** Mount the panel with a 7-pizza basket seeded (the same useState patch scripts/add-order-render.cjs uses). */
async function mount(Panel, props) {
  const dom = installMiniDom()
  const root = createRoot(dom.container)
  const realUseState = React.useState; let armed = true
  React.useState = function (init) { if (armed && Array.isArray(init) && init.length === 0) { armed = false; return realUseState(basket(7)) } return realUseState(init) }
  try { await act(async () => { root.render(React.createElement(Panel, props)) }) } finally { React.useState = realUseState }
  await settle()
  const render = async p => { await act(async () => { root.render(React.createElement(Panel, p)) }); await settle() }
  const select = () => dom.container.all('select')[0]
  const option = t => { const o = (select() ? select().all('option') : []).find(o => stripMark(o.textContent).startsWith(t)); return o ? stripMark(o.textContent) : null }
  return { dom, root, render, select, option, unmount: async () => { await act(async () => root.unmount()); dom.teardown() } }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `aorf-${tag}-`))
    for (const d of ['components', 'lib', 'app']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true })
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
    const f = path.join(tmp, 'components/dashboard/AddOrderPanel.tsx'); let src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out); return { tmp, tree: buildTree(tmp, tag) }
  }
  {
    // V1: the stale memo dependency restored — the dashboard-refetch signal effect removed, so a changed
    // `offlineCapacity` prop reaches nothing while the panel's own snapshot stands.
    const v = variant('v1', src => { const a = src.indexOf('  const capacitySignature = useMemo('); const b = src.indexOf('  // RECONNECT: fetchManualSlots', a); return a < 0 || b < 0 ? src : src.slice(0, a) + src.slice(b) })
    const Panel = v.tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
    server.board = EMPTY_BOARD; server.slotsCalls = 0
    const m = await mount(Panel, baseProps())
    const before = m.option('17:30')
    await sleep(WINDOW_MS + 300)                                  // clear the mount fetch's window
    server.board = CUSTOMER_7                                      // the customer order lands…
    await m.render(baseProps({ offlineCapacity: offlineCapacityFor(CUSTOMER_7) }))   // …and the dashboard refetches
    await sleep(300); await settle()
    const after = m.option('17:30')
    const stale = after === before && !/Not enough time/.test(after || '')
    console.log(`  ${stale ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 refetch signal removed: "${before}" → "${after}" (${server.slotsCalls} slots reads)`)
    await m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true })
    if (!stale) process.exit(1)
  }
  {
    // V2: the dropdown open not fetching — the two handlers removed from the <select>.
    const v = variant('v2', src => src.replace("          onPointerDown={() => { capacityRefresher.request('dropdown-open') }}\n          onFocus={() => { capacityRefresher.request('dropdown-focus') }}\n", ''))
    const Panel = v.tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
    server.board = EMPTY_BOARD; server.slotsCalls = 0
    const m = await mount(Panel, baseProps())
    await sleep(WINDOW_MS + 300)
    const n0 = server.slotsCalls
    const p = m.select().reactProps
    if (p.onPointerDown) p.onPointerDown({}); if (p.onFocus) p.onFocus({})
    await sleep(300); await settle()
    const none = server.slotsCalls === n0
    console.log(`  ${none ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 no open handler: opening the dropdown made ${server.slotsCalls - n0} fresh reads`)
    await m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true })
    if (!none) process.exit(1)
  }

  console.log('\n── THE REAL PANEL ───────────────────────────────────────────────────────────────────────')
  const tree = buildTree(REPO, 'aorf')
  const Panel = tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
  server.board = EMPTY_BOARD; server.slotsCalls = 0; server.fail = false
  const m = await mount(Panel, baseProps())
  check(server.slotsCalls === 1, `mount: one /api/slots read (${server.slotsCalls})`)
  check(m.option('17:30') === '17:30 🟢', `before: "${m.option('17:30')}" — no count, no label (an empty board)`)
  await sleep(WINDOW_MS + 300)

  // 1. the customer's 7 @17:30 lands; the dashboard refetches → new offlineCapacity prop
  server.board = CUSTOMER_7
  await m.render(baseProps({ offlineCapacity: offlineCapacityFor(CUSTOMER_7) }))
  await sleep(300); await settle()
  check(server.slotsCalls === 2, `dashboard refetch → exactly one fresh /api/slots read (${server.slotsCalls} total)`)
  check(m.option('17:30') === '17:30 🟡 7 Pizzas · Not enough time', `after: "${m.option('17:30')}"`)
  check(m.option('17:45') === '17:45 🟢', `…and 17:45 still fits: "${m.option('17:45')}" (7 in 17:30–17:45 free)`)

  // 2. opening the dropdown inside the window: exactly ONE trailing read, never dropped, never blocking
  const n0 = server.slotsCalls; const t0 = Date.now()
  const p = m.select().reactProps
  const ret = p.onPointerDown({}); p.onPointerDown({}); p.onFocus({})
  check(ret === undefined && server.slotsCalls === n0, 'three opens inside the throttle window: the handler returns at once and no read has started yet')
  await sleep(WINDOW_MS + 400); await settle()
  check(server.slotsCalls === n0 + 1, `…then exactly ONE fresh read at the window's end (${server.slotsCalls - n0}), ${Date.now() - t0} ms after the first open`)
  // 3. outside the window: one open → one immediate read
  await sleep(WINDOW_MS + 300)
  const n1 = server.slotsCalls; p.onPointerDown({}); await sleep(100); await settle()
  check(server.slotsCalls === n1 + 1, `an open outside the window → one immediate read (${server.slotsCalls - n1})`)

  // 4. a failed fetch leaves the list unchanged
  await sleep(WINDOW_MS + 300)
  server.fail = true; const n2 = server.slotsCalls; const kept = m.option('17:30')
  p.onPointerDown({}); await sleep(200); await settle()
  check(server.slotsCalls === n2 + 1 && m.option('17:30') === kept, `a failed read: attempted (${server.slotsCalls - n2}), list unchanged: "${m.option('17:30')}"`)
  server.fail = false

  // 5. offline: no read at all — the cached view stands
  await sleep(WINDOW_MS + 300)
  await m.render(baseProps({ isOffline: true, offlineCapacity: offlineCapacityFor(CUSTOMER_7) }))
  const n3 = server.slotsCalls
  m.select().reactProps.onPointerDown({}); await sleep(200); await settle()
  await m.render(baseProps({ isOffline: true, offlineCapacity: offlineCapacityFor({ units: { '17:30': { pizza: 7 }, '18:00': { pizza: 1 } }, reservations: CUSTOMER_7.reservations }) }))
  await sleep(200); await settle()
  check(server.slotsCalls === n3, `offline: dropdown open + a changed cache → ${server.slotsCalls - n3} reads`)
  check(/Not enough time/.test(m.option('17:30') || ''), `offline: the list still shows the last data: "${m.option('17:30')}"`)
  await m.unmount()

  console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ the time list refreshes from the same read the popup uses'}`)
  process.exit(fails ? 1 : 0)
})().catch(e => { console.log('🔴 harness crashed: ' + (e && e.stack || e)); process.exit(1) })
