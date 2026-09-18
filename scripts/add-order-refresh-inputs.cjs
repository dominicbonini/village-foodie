#!/usr/bin/env node
// scripts/add-order-refresh-inputs.cjs — EVERY input the Add Order time list is made of invalidates its
// snapshot, so the list matches the dashboard strip with no manual refresh.
//   node scripts/add-order-refresh-inputs.cjs      (≈ 90 s: real 5-second throttle windows, three compiles)
//
// 🔴 FAILURE MODE (Dominic, 18 September 2026, test-truck, both without a refresh):
//   (a) he cancelled a 3-pizza order for 11:45 and the list still showed "11:45 🟡 3 Pizzas";
//   (b) he set the van to 2 per batch with a 5-minute cook and the times to every 5 minutes — the strip
//       changed at once while Add Order kept 4-per-batch counts on a 15-minute grid.
// Cause: the panel's invalidation key covered THREE fields of the dashboard payload (productionSlotUnits,
// reservations, batchReservations), so only an ORDER change asked for a fresh read — never the grid, the
// categories, the van capacity or the event's own slot flags; and a change arriving while the tab was
// hidden was consumed by the key and never re-asked. The key is now EVERY capacity-relevant field of that
// payload (`capacitySignature`), and a change while hidden is HELD and fired on activation.
//
// 🔴 SECOND FAILURE MODE (Dominic, 19 September 2026, test-truck): he cancelled an order from the
// dashboard, moved to Add Order, and the list STILL showed that order's pizzas; only a page reload
// cleared it — the same symptom the round above was meant to fix. Two causes, both proven below:
//   (1) UPSTREAM. `handleGateResult` ends every operator action with `await refetch()`, a plain
//       fetchAll, and fetchAll DROPS itself when a read is already in flight (the R4 poll guard). Cancel
//       while the 60 s poll happened to be outstanding and the dashboard never refetched: `orders` and
//       `offlineCapacity` both kept their pre-cancel values, so the panel's key had NOTHING to notice
//       and never asked for a fresh read. Intermittent exactly as reported. Fixed by giving fetchAll a
//       `supersede` mode — an operator's own action aborts the outstanding poll instead of being
//       discarded — and by the MAX-AGE backstop here, so the list does not depend on that at all.
//   (2) THE KEY WAS INDIRECT. `capacitySignature` is built from a FOLD of the orders (occupancy), so it
//       witnesses a status change only in so far as that order's items moved oven load. The key now
//       carries the orders' STATUSES themselves (`ordersSignature`), so any transition changes it by
//       construction. V4 below reverts to the old key and the cancel goes stale.
//
// HOW: the REAL component on scripts/_mini-dom.cjs, kept mounted across re-renders so state survives and
// effects run. `fetch` answers /api/slots with whatever board the scenario says the server holds, and
// counts the reads. A "board" here is the whole capacity payload: grid interval, cooking categories, van
// kitchen capacity and window, the units and their reservations.
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { installMocks } = require('./_printing-mocks.cjs'); const { installMiniDom } = require('./_mini-dom.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))
// 19 September 2026: a row now leads with the refusal marker — '✕ ' when this order cannot be ready by
// then, a same-width en space otherwise — so option text is matched after stripping it.
const stripMark = (t) => String(t || '').replace(/^[\u00d7\u2007]\u0020/, '')
const WINDOW_MS = 5000

function buildTree(root, tag) {
  const c = compile(root, ['components/dashboard/AddOrderPanel.tsx', 'components/printing/PrintingSettings.tsx', 'components/printing/PrinterTypeChoice.tsx'], tag, { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false })
  installMocks(c.out, { native: false })
  const stub = (pkg, body) => { const d = path.join(c.out, 'node_modules', ...pkg.split('/')); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, main: 'index.js' })); fs.writeFileSync(path.join(d, 'index.js'), body) }
  fs.mkdirSync(path.join(c.out, 'node_modules', 'next'), { recursive: true }); fs.writeFileSync(path.join(c.out, 'node_modules', 'next', 'package.json'), JSON.stringify({ name: 'next' }))
  stub('next/navigation', 'module.exports = { useParams: () => ({ token: "tok" }), useRouter: () => ({ push(){}, replace(){} }), usePathname: () => "/" }')
  for (const pkg of ['@capacitor/network', '@capacitor/app', '@capacitor/local-notifications', '@capacitor/keep-awake', '@capacitor-community/keep-awake', '@capacitor/status-bar', '@capacitor/push-notifications', '@aparajita/capacitor-biometric-auth', '@hatchgrab/net-printer'])
    stub(pkg, 'module.exports = new Proxy({}, { get: () => new Proxy(function(){}, { get: () => () => {}, apply: () => Promise.resolve({}) }) })')
  return c
}

// ── FIXTURE: test-truck, a LIVE event 10:00–14:00, Dominic's own shape ───────────────────────────
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const EVENT = { id: 'ev-live', event_date: '2099-01-01', start_time: '10:00', end_time: '14:00', venue_name: 'Live', status: 'open', van_id: null }
const MENU_ITEM = { id: 'i1', name: 'Margherita', price: 9, category: 'Pizza', is_available: true }
// 🔴 THE ORDERS THEMSELVES. The panel already receives `orders`; the snapshot key now reads their
// STATUSES, so these rows are what makes a cancel/reject/refund/collected visible to it even when the
// folded occupancy it used to key on happens not to move. `slot` and quantity are in the key too, so an
// edit that moves the time or changes the count is a change as well.
const ORD = (status, slot = '11:45', key = 'o1') => ({ order_key: key, id: key === 'o1' ? 1 : 2, event_id: EVENT.id, status, slot, items: [{ name: 'Margherita', quantity: key === 'o1' ? 3 : 4 }] })
const slotsFor = (iv, over = {}) => { const o = []; for (let m = 600; m <= 840; m += iv) { const t = fmt(m)
  o.push({ collection_time: t, production_slot: t, production_window_key: t, available: true, is_grace: false, is_past: false, ...(over[t] || {}) }) } return o }
/** 4 per batch, 15-minute cook, 15-minute grid; a 3-pizza order collected 11:45. */
const BASE = { ord: [ORD('confirmed')], iv: 15, cfg: { pizza: { secs: 900, batch: 4 } }, kc: null, cw: 5, over: {},
  units: { '11:45': { pizza: 3 } }, res: [{ orderKey: 'o1', slot: '11:45', source: 'fit', cats: { pizza: { items: 3, batch: 4, prepMins: 15, windows: [{ startMins: 690, endMins: 705, items: 3 }] } } }] }
const CANCELLED = { ...BASE, units: { '11:45': { pizza: 0 } }, res: [], ord: [ORD('cancelled')] }
// The FOUR terminal transitions, each its own fixture. The board is the same — none of them leaves the
// order in the oven — but the STATUS differs, and the status is what the key reads.
const REJECTED  = { ...CANCELLED, ord: [ORD('rejected')] }
const REFUNDED  = { ...CANCELLED, ord: [ORD('refunded')] }
const COLLECTED = { ...CANCELLED, ord: [ORD('collected')] }
const EDITED = { ...BASE, ord: [ORD('confirmed', '12:15')], units: { '11:45': { pizza: 0 }, '12:15': { pizza: 3 } },                // an edit that MOVES the time
  res: [{ orderKey: 'o1', slot: '12:15', source: 'fit', cats: { pizza: { items: 3, batch: 4, prepMins: 15, windows: [{ startMins: 720, endMins: 735, items: 3 }] } } }] }
const INCOMING = { ...BASE, ord: [ORD('confirmed'), ORD('confirmed', '12:15', 'o2')], units: { '11:45': { pizza: 3 }, '12:15': { pizza: 4 } },              // an order comes through
  res: [...BASE.res, { orderKey: 'o2', slot: '12:15', source: 'fit', cats: { pizza: { items: 4, batch: 4, prepMins: 15, windows: [{ startMins: 720, endMins: 735, items: 4 }] } } }] }
const SETTINGS = { ...BASE, iv: 5, cfg: { pizza: { secs: 300, batch: 2 } }, kc: 2 }               // Dominic's (b)
const CATEGORY = { ...BASE, cfg: { pizza: { secs: 1800, batch: 4 } } }                            // Menu & Stock: prep 15 → 30
const VAN_CAP = { ...BASE, kc: 2 }                                                                // Manage: van kitchen capacity
// The EVENT's own times change: 11:00 and 11:15 fall into grace (the event closed early / the clock moved
// on). `is_grace` is what the operator list renders differently — "⚠️ 11:00 · After closing". A pause's
// `available: false` is ALSO in the signature and triggers the same read; the operator list deliberately
// still OFFERS such a time (they may override), so it is the read, not the line, that changes there.
const CLOSING = { ...BASE, over: { '11:00': { is_grace: true }, '11:15': { is_grace: true } } }
const capIn = b => ({ productionSlotUnits: b.units, kitchenCapacity: b.kc, capacityWindowMins: b.cw, intervalMins: b.iv, eventStartMins: 600, eventEndMins: 840, earliestCollectionMins: 0, date: EVENT.event_date, nowMins: 0, windowSecs: 0, reservations: b.res, batchReservations: true })
const slotsBody = b => ({ slots: slotsFor(b.iv, b.over), queueByCat: {}, capacityInputs: capIn(b), catConfigs: b.cfg, tz: 'Europe/London' })
const offCap = b => ({ eventId: EVENT.id, slots: slotsFor(b.iv, b.over), productionSlotUnits: b.units, kitchenCapacity: b.kc, intervalMins: b.iv, capacityWindowMins: b.cw, eventStartMins: 600, catConfigs: b.cfg, reservations: b.res, batchReservations: true })
const baseProps = (b, over = {}) => ({
  truck: { id: 'test-truck', name: 'Pizza Kitchen', plan: 'trial', feature_overrides: { batch_reservations: true }, trial_expires_at: null, slug: 'test-kitchen' },
  truckMenu: { items: [MENU_ITEM], categories: [{ id: 'c1', name: 'Pizza' }] }, menuGroups: { Pizza: [MENU_ITEM] },
  itemStocks: [], categoryStocks: [], categoryConfigs: b.cfg, categoryAllowNotes: { pizza: true },
  orders: b.ord ?? [], waitMinutes: 10, token: 'fixture-token', pin: '', todayEvent: EVENT, categoryOrder: ['Pizza'], itemCategoryMap: { Margherita: 'Pizza' },
  showToast: () => {}, onOrderPlaced: () => {}, isOffline: false, offlineCapacity: offCap(b), isEventLoaded: () => true,
  isActive: true, isDemo: false, buzzerCount: null, buzzerPromptEnabled: false, ...over,
})
const server = { board: BASE, fail: false, slotsCalls: 0 }
global.fetch = async (url) => { const u = String(url)
  if (u.includes('/api/slots/')) { server.slotsCalls++; if (server.fail) throw new TypeError('Failed to fetch')
    const body = slotsBody(server.board); return { ok: true, status: 200, json: async () => body } }
  if (u.includes('/api/events/manage')) return { ok: true, status: 200, json: async () => ({ events: [EVENT] }) }
  return { ok: true, status: 200, json: async () => ({ ok: true }) } }

const React = require('react'); const { act } = React
const realError = console.error; console.error = (...a) => { if (/not wrapped in act/.test(String(a[0]))) return; realError(...a) }
const { createRoot } = require('react-dom/client')
const settle = async () => { await act(async () => { await sleep(20) }); await act(async () => { await sleep(20) }) }
async function mount(Panel, props, { strict = false } = {}) {
  const dom = installMiniDom(); const root = createRoot(dom.container)
  // 🔴 `strict` wraps the tree in React.StrictMode — Next's DEV default, i.e. what Dominic's browser does.
  // Effects mount → unmount → mount; anything disposed in a cleanup and not re-created in the setup is dead.
  const wrap = el => strict ? React.createElement(React.StrictMode, null, el) : el
  const realUseState = React.useState; let armed = true
  React.useState = function (init) { if (armed && Array.isArray(init) && init.length === 0) { armed = false; return realUseState([{ name: 'Margherita', quantity: 1, unit_price: 9, cartKey: 'Margherita' }]) } return realUseState(init) }
  try { await act(async () => { root.render(wrap(React.createElement(Panel, props))) }) } finally { React.useState = realUseState }
  await settle()
  const opts = () => { const s = dom.container.all('select')[0]; return (s ? s.all('option') : []).map(o => o.textContent) }
  return { dom, root,
    render: async p => { await act(async () => { root.render(wrap(React.createElement(Panel, p))) }); await settle() },
    opts, option: t => (opts().map(stripMark).find(o => o.startsWith(t))) || null,
    times: () => opts().map(stripMark).filter(o => /^\d\d:\d\d/.test(o)).map(o => o.slice(0, 5)),
    unmount: async () => { await act(async () => root.unmount()); dom.teardown() } }
}
/** Add one Margherita to the basket through the panel's OWN handler — the props React attached to the
 *  menu button, i.e. the same function a tap calls. Not a prop change: real internal basket state. */
async function addItem(m) {
  const btns = m.dom.container.all('button').filter(b => b.reactProps && b.reactProps.onClick)
  const btn = btns.find(b => /Margherita/.test(b.textContent))
  if (!btn) { console.log('🔴 no Margherita button found; buttons were:', btns.map(b => JSON.stringify(b.textContent.slice(0, 40)))); process.exit(1) }
  await act(async () => { btn.reactProps.onClick({ stopPropagation() {}, preventDefault() {} }) })
  await settle()
}
/** Open the time dropdown through its own onPointerDown — the trigger the panel wires. */
async function openDropdown(m) {
  const sel = m.dom.container.all('select')[0]
  await act(async () => { sel.reactProps.onPointerDown({}) })
  await settle()
}
/** Mount on BASE, let the throttle window pass, switch the server AND the dashboard prop to `after`. */
async function scenario(Panel, after, { hidden = false } = {}) {
  server.board = BASE; server.slotsCalls = 0
  const m = await mount(Panel, baseProps(BASE))
  const before = { l1145: m.option('11:45'), l1215: m.option('12:15'), times: m.times().length, l1100: m.option('11:00') }
  await sleep(WINDOW_MS + 300)
  server.board = after
  if (hidden) {                                   // the change lands while the operator is on another tab
    await m.render(baseProps(BASE, { isActive: false }))
    await m.render(baseProps(after, { isActive: false }))
    await sleep(400); await settle()
    const readsWhileHidden = server.slotsCalls
    await m.render(baseProps(after, { isActive: true }))
    await sleep(800); await settle()
    return { m, before, after: { l1145: m.option('11:45'), l1215: m.option('12:15'), times: m.times().length, l1100: m.option('11:00') }, readsWhileHidden, reads: server.slotsCalls }
  }
  await m.render(baseProps(after))
  await sleep(800); await settle()
  return { m, before, after: { l1145: m.option('11:45'), l1215: m.option('12:15'), times: m.times().length, l1100: m.option('11:00') }, reads: server.slotsCalls }
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `aori-${tag}-`))
    for (const d of ['components', 'lib', 'app']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true })
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
    const f = path.join(tmp, 'components/dashboard/AddOrderPanel.tsx'); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out); return { tmp, tree: buildTree(tmp, tag) }
  }
  {
    // V1 — TODAY'S INVALIDATION: the key narrowed back to the three order fields. Dominic's (b) must go stale.
    const v = variant('v1', src => src.replace(/    return JSON\.stringify\(\[\n(?:.*\n)*?    \]\)\n  \}, \[offlineForThisEvent\]\)/,
      '    return JSON.stringify([c.productionSlotUnits, c.reservations ?? null, c.batchReservations ?? null])\n  }, [offlineForThisEvent])'))
    const Panel = v.tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
    const r = await scenario(Panel, SETTINGS)
    const stale = r.after.times === r.before.times && r.after.l1145 === r.before.l1145
    console.log(`  ${stale ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 the old three-field key — Dominic's (b): "${r.before.l1145}"/${r.before.times} times → "${r.after.l1145}"/${r.after.times} times (${r.reads} reads)`)
    await r.m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true }); if (!stale) process.exit(1)
  }
  {
    // V2 — the change SWALLOWED while the tab is hidden (the old order: advance the ref, then bail) AND
    // the tab-shown net removed with it. TWO patches on purpose: they are the SAME recovery, and either
    // alone still saves the change, so only removing both shows what the held flag is for — a change that
    // arrives while the operator is elsewhere must not be lost, whatever else happens to fire afterwards.
    const v = variant('v2', src => src.replace(
      "    if (snapshotKey !== lastSignatureRef.current) { lastSignatureRef.current = snapshotKey; signatureDirtyRef.current = true }\n    if (!signatureDirtyRef.current) return\n",
      "    if (snapshotKey === lastSignatureRef.current) return\n    lastSignatureRef.current = snapshotKey\n")
      .replace("      capacityRefresher.request('tab-shown')", "      /* net removed */"))
    const Panel = v.tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    const before = m.option('11:45')
    await m.render(baseProps(BASE, { isActive: false }))          // hide FIRST, inside the throttle window
    server.board = CANCELLED
    await m.render(baseProps(CANCELLED, { isActive: false }))     // the cancel lands while hidden → swallowed
    await sleep(300); await settle()
    await m.render(baseProps(CANCELLED, { isActive: true }))      // back to Add Order, still inside the window
    await sleep(600); await settle()
    const stale = /3 Pizzas/.test(m.option('11:45') || '')
    console.log(`  ${stale ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 a hidden-tab change discarded, with the tab-shown net gone too: "${before}" → "${m.option('11:45')}" (${server.slotsCalls} reads)`)
    await m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true }); if (!stale) process.exit(1)
  }
  {
    // V3 — the THROTTLE with no trailing call: a change arriving inside the 5-second window is dropped
    // for good. Patched in lib/capacity-refresh.ts (the rule lives there, not in the panel).
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aori-v3-'))
    for (const d of ['components', 'lib', 'app']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true })
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
    const f = path.join(tmp, 'lib/capacity-refresh.ts'); const src = fs.readFileSync(f, 'utf8')
    const needle = 'if (now() - lastStart < minInterval) { schedule(); return false }'
    if (src.split(needle).length !== 2) { console.log('🔴 v3: the throttle line was not found exactly once'); process.exit(1) }
    fs.writeFileSync(f, src.replace(needle, 'if (now() - lastStart < minInterval) { return false }'))
    const Panel = buildTree(tmp, 'v3').req('components/dashboard/AddOrderPanel.js').AddOrderPanel
    // The mount's read is DIRECT (fetchManualSlots), so it does not open the refresher's window. Change
    // once to open it — that read is allowed through — then change again immediately: the second lands
    // inside the window, and with no trailing call it is dropped for good.
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    await settle()
    server.board = INCOMING
    await m.render(baseProps(INCOMING)); await sleep(400); await settle()   // opens the window
    const opened = server.slotsCalls
    server.board = CANCELLED
    await m.render(baseProps(CANCELLED))                                    // lands INSIDE it
    await sleep(WINDOW_MS + 900); await settle()                            // …and the window passes
    const stale = /3 Pizzas/.test(m.option('11:45') || '') && server.slotsCalls === opened
    const before = '11:45 🟡 3 Pizzas'
    console.log(`  ${stale ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 throttle with no trailing call: "${before}" → "${m.option('11:45')}" (${server.slotsCalls} reads)`)
    await m.unmount(); fs.rmSync(tmp, { recursive: true, force: true }); if (!stale) process.exit(1)
  }

  {
    // V4 — TODAY'S KEY: the snapshot key reduced to `capacitySignature` alone, i.e. the fold, with the
    // orders' statuses dropped out of it. The scenario is the one that broke on 19 September: the order's
    // STATUS changes and the dashboard's folded capacity view does NOT move (it is the same object — the
    // fold had already been computed, or the cancelled order's items mapped to nothing). The old key has
    // nothing to compare, so no read is asked for and the list keeps the cancelled order's pizzas.
    const v = variant('v4', src => src.replace(
      'const snapshotKey = `${capacitySignature}\\u00a6${ordersSignature}`',
      'const snapshotKey = capacitySignature'))
    const Panel = v.tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    const before = m.option('11:45')
    await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    server.board = CANCELLED                                          // the server knows
    await m.render(baseProps(BASE, { orders: CANCELLED.ord }))        // …only the STATUS reaches the panel
    await sleep(900); await settle()
    const stale = /3 Pizzas/.test(m.option('11:45') || '') && server.slotsCalls === atRest
    console.log(`  ${stale ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V4 the fold-only key on a STATUS-only cancel: "${before}" → "${m.option('11:45')}" (${server.slotsCalls - atRest} reads)`)
    await m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true }); if (!stale) process.exit(1)
  }
  {
    // V5 — the BASKET trigger removed. Adding the first item is the moment the crosses and the "Not
    // enough time" labels appear, and they are computed from whatever snapshot is held; without this
    // trigger the operator is shown a promise made from data taken when the tab was opened.
    const v = variant('v5', src => src.replace("    capacityRefresher.request('basket-changed')", '    /* trigger removed */'))
    const Panel = v.tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    await addItem(m); await sleep(600); await settle()
    const silent = server.slotsCalls === atRest
    console.log(`  ${silent ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V5 basket trigger removed: adding an item asked for ${server.slotsCalls - atRest} reads`)
    await m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true }); if (!silent) process.exit(1)
  }

  {
    // V6 — THE LIFETIME BUG THAT THREE ROUNDS OF FIXTURES MISSED (19 September 2026). The refresher built
    // once in useMemo with `dispose()` in a cleanup effect. Correct in a plain mount; DEAD under
    // React.StrictMode, because the simulated unmount disposes the memoised object and the remount reuses
    // it. Every trigger then returns false. This variant restores that shape and mounts under StrictMode:
    // the cancel must go stale with ZERO reads. Without the `strict` mount this variant PASSES — which is
    // exactly how the previous rounds were fooled.
    const v = variant('v6', src => src
      .replace(/  const refresherRef = useRef<CapacityRefresher \| null>\(null\)\n  useEffect\(\(\) => \{\n    const r = createCapacityRefresher<FreshSlotsBody>\(\{/, '  const capacityRefresherMemo = useMemo(() => createCapacityRefresher<FreshSlotsBody>({')
      .replace(/    \}\)\n    refresherRef\.current = r\n    return \(\) => \{ r\.dispose\(\); if \(refresherRef\.current === r\) refresherRef\.current = null \}\n  \}, \[\]\)/, '    }), [])\n  useEffect(() => () => capacityRefresherMemo.dispose(), [capacityRefresherMemo])\n  const refresherRef = { current: capacityRefresherMemo }'))
    const Panel = v.tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE), { strict: true })
    const before = m.option('11:45')
    await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    server.board = CANCELLED; await m.render(baseProps(CANCELLED)); await sleep(900); await settle()
    const stale = /3 Pizzas/.test(m.option('11:45') || '') && server.slotsCalls === atRest
    console.log(`  ${stale ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V6 useMemo + dispose-in-cleanup under React.StrictMode (the dev default): "${before}" → "${m.option('11:45')}" (${server.slotsCalls - atRest} reads)`)
    await m.unmount(); fs.rmSync(v.tmp, { recursive: true, force: true }); if (!stale) process.exit(1)
  }

  const tree = buildTree(REPO, 'aoriReal')
  const Panel = tree.req('components/dashboard/AddOrderPanel.js').AddOrderPanel

  console.log("\n── DOMINIC'S TWO CASES ──────────────────────────────────────────────────────────────────")
  { const r = await scenario(Panel, CANCELLED)
    check(r.before.l1145 === '11:45 🟡 3 Pizzas' && r.after.l1145 === '11:45 🟢' && r.reads === 2,
      `(a) the 3-pizza 11:45 order is cancelled: "${r.before.l1145}" → "${r.after.l1145}" in ${r.reads} reads, no manual refresh`)
    await r.m.unmount() }
  { const r = await scenario(Panel, CANCELLED, { hidden: true })
    check(r.after.l1145 === '11:45 🟢', `(a) …and when the cancel is made from the ORDERS tab: ${r.readsWhileHidden} reads while hidden, then "${r.after.l1145}" on return`)
    await r.m.unmount() }
  { const r = await scenario(Panel, SETTINGS)
    check(r.after.times === 49 && r.before.times === 17, `(b) 4-per-batch/15-min cook/15-min grid → 2-per-batch/5-min cook/5-min grid: the GRID moves ${r.before.times} → ${r.after.times} times`)
    check(r.after.l1145 === '11:45 🟡 1 Pizza', `(b) …and the LABEL is recomputed on the new categories: "${r.before.l1145}" → "${r.after.l1145}" (${r.reads} reads)`)
    await r.m.unmount() }

  console.log('\n── AN ORDER COMING THROUGH MUST NOT LEAVE A TAKEN TIME LOOKING FREE ─────────────────────')
  { const r = await scenario(Panel, INCOMING)
    check(r.before.l1215 === '12:15 🟢' && r.after.l1215 === '12:15 🔴 4 Pizzas',
      `a 4-pizza order arrives for 12:15 and fills the batch: "${r.before.l1215}" → "${r.after.l1215}" (${r.reads} reads)`)
    await r.m.unmount() }
  { const r = await scenario(Panel, INCOMING, { hidden: true })
    check(r.after.l1215 === '12:15 🔴 4 Pizzas', `…and the same when it arrives while the operator is on another tab: "${r.after.l1215}"`)
    await r.m.unmount() }

  console.log('\n── EVERY OTHER INPUT THE LIST IS MADE OF ────────────────────────────────────────────────')
  { const r = await scenario(Panel, EDITED)
    check(r.after.l1145 === '11:45 🟢' && r.after.l1215 === '12:15 🟡 3 Pizzas',
      `an EDIT moves the order 11:45 → 12:15: "${r.after.l1145}" and "${r.after.l1215}" (${r.reads} reads)`)
    await r.m.unmount() }
  { server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    const before = JSON.stringify(m.opts())
    await sleep(WINDOW_MS + 300)
    server.board = CATEGORY; await m.render(baseProps(CATEGORY)); await sleep(800); await settle()
    const after = JSON.stringify(m.opts())
    check(after !== before && m.option('11:45') === '11:45 🟡 3 Pizzas',
      `a MENU & STOCK prep change (15 → 30 minutes) re-spreads the same 3 pizzas across the list — the rendered lines change (${server.slotsCalls} reads), 11:45 itself still "${m.option('11:45')}"`)
    await m.unmount() }
  { const r = await scenario(Panel, VAN_CAP)
    check(r.after.l1145 !== r.before.l1145, `a MANAGE van kitchen-capacity change (none → 2) re-tones the list: "${r.before.l1145}" → "${r.after.l1145}" (${r.reads} reads)`)
    await r.m.unmount() }
  { const r = await scenario(Panel, CLOSING)
    const graced = r.m.opts().filter(o => /After closing/.test(o)).length
    check(r.before.l1100 === '11:00 🟢' && graced === 2,
      `an EVENT-TIMES change (11:00 and 11:15 fall into grace) reaches the list: "${r.before.l1100}" → ${graced} times now read "⚠️ … · After closing" (${r.reads} reads)`)
    await r.m.unmount() }
  { // a PAUSE (available: false) is in the signature too: it triggers the read even though the operator
    // list still offers the time — the labels behind it are what the fresh read corrects.
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    const PAUSED = { ...BASE, over: { '11:00': { available: false }, '11:15': { available: false } } }
    server.board = PAUSED; await m.render(baseProps(PAUSED)); await sleep(800); await settle()
    check(server.slotsCalls === atRest + 1, `a PAUSE (11:00, 11:15 unavailable) invalidates the snapshot: ${server.slotsCalls - atRest} fresh read`)
    await m.unmount() }

  console.log('\n── THE RULES THE SAFETY NET KEEPS ───────────────────────────────────────────────────────')
  { // ONE read per change, throttled: five changes inside one window collapse into the mount read + one trailing
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    for (const b of [CANCELLED, EDITED, INCOMING, VAN_CAP, SETTINGS]) { server.board = b; await m.render(baseProps(b)); await sleep(60) }
    await sleep(WINDOW_MS + 900); await settle()
    check(server.slotsCalls <= 3, `five changes inside one 5-second window: ${server.slotsCalls} reads in total (mount + at most two), not one per change`)
    check(m.times().length === 49, `…and the list ends on the LAST state (the 5-minute grid): ${m.times().length} times`)
    await m.unmount() }
  { // a FAILED refresh applies nothing — the last good data stays, silently
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    const before = m.option('11:45')
    await sleep(WINDOW_MS + 300)
    server.fail = true; server.board = CANCELLED
    await m.render(baseProps(CANCELLED)); await sleep(700); await settle()
    check(m.option('11:45') === before, `a failed refresh changes nothing and raises nothing: "${m.option('11:45')}"`)
    server.fail = false
    await m.unmount() }
  { // OFFLINE makes no fetch at all
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    server.board = CANCELLED
    await m.render(baseProps(CANCELLED, { isOffline: true })); await sleep(700); await settle()
    check(server.slotsCalls === atRest, `offline: ${server.slotsCalls - atRest} fetches made (must be 0)`)
    await m.unmount() }
  { // 🔴 THE SCREEN DOES NOT REFRESH. A capacity change re-renders the LIST in place: the <select> is the
    // same DOM node before and after, and the operator's chosen time survives — nothing remounts, so an
    // in-progress basket and the scroll position are untouched.
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    const nodeBefore = m.dom.container.all('select')[0]
    const optsBefore = m.opts().length
    await sleep(WINDOW_MS + 300)
    server.board = INCOMING
    await m.render(baseProps(INCOMING)); await sleep(800); await settle()
    const nodeAfter = m.dom.container.all('select')[0]
    check(nodeBefore === nodeAfter, 'the time <select> is the SAME DOM node after a refresh — the list updates in place, nothing remounts')
    check(m.option('12:15') === '12:15 🔴 4 Pizzas' && m.opts().length === optsBefore,
      `…and only the LABELS moved: 12:15 now "${m.option('12:15')}", still ${m.opts().length} options`)
    await m.unmount() }


  console.log('\n── UNDER React.StrictMode — WHAT DOMINIC\'S DEV BROWSER ACTUALLY RUNS ────────────────────')
  for (const [name, board] of [['cancel', CANCELLED], ['an order coming through', INCOMING]]) {
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE), { strict: true })
    const b45 = m.option('11:45'); const b1215 = m.option('12:15'); await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    server.board = board; await m.render(baseProps(board)); await sleep(900); await settle()
    const ok = name === 'cancel' ? m.option('11:45') === '11:45 🟢' : m.option('12:15') === '12:15 🔴 4 Pizzas'
    check(ok && server.slotsCalls === atRest + 1, `StrictMode: ${name} still refreshes the list — "${name === 'cancel' ? b45 : b1215}" → "${name === 'cancel' ? m.option('11:45') : m.option('12:15')}" (${server.slotsCalls - atRest} read)`)
    await m.unmount()
  }
  { // …and the operator's own triggers survive the double-mount too
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE), { strict: true })
    await sleep(WINDOW_MS + 300); const atRest = server.slotsCalls
    server.board = CANCELLED; await addItem(m); await sleep(700); await settle()
    check(server.slotsCalls === atRest + 1 && m.option('11:45') === '11:45 🟢', `StrictMode: adding a basket item asks for ${server.slotsCalls - atRest} read and the list is fresh: "${m.option('11:45')}"`)
    await m.unmount() }

  console.log('\n── EVERY STATUS TRANSITION CLEARS THE ORDER FROM THE LIST, WITH NO MANUAL REFRESH ───────')
  for (const [name, board] of [['cancelled', CANCELLED], ['rejected', REJECTED], ['refunded', REFUNDED], ['collected', COLLECTED]]) {
    const r = await scenario(Panel, board)
    check(r.before.l1145 === '11:45 🟡 3 Pizzas' && r.after.l1145 === '11:45 🟢',
      `an order marked ${name.toUpperCase()} leaves the list: "${r.before.l1145}" → "${r.after.l1145}" (${r.reads} reads)`)
    await r.m.unmount()
  }
  { // 🔴 THE 19 SEPTEMBER CASE ITSELF: the STATUS changes and the folded capacity view does NOT move.
    // This is what V4 fails on. The key reads the statuses, so it notices and the fresh read corrects.
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    const before = m.option('11:45')
    await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    server.board = CANCELLED
    await m.render(baseProps(BASE, { orders: CANCELLED.ord }))   // offlineCapacity byte-identical
    await sleep(900); await settle()
    check(m.option('11:45') === '11:45 🟢' && server.slotsCalls === atRest + 1,
      `a status-only cancel (the dashboard's folded capacity unchanged): "${before}" → "${m.option('11:45')}" in ${server.slotsCalls - atRest} read`)
    await m.unmount() }
  { // 🔴 DOMINIC'S ACTUAL BUG: the dashboard refetch was DROPPED, so NEITHER prop changed. Nothing
    // invalidates the key — there is nothing to invalidate it with. The MAX-AGE backstop reads anyway.
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    const before = m.option('11:45')
    server.board = CANCELLED                                     // the server knows; the dashboard never told us
    // SLOT_SNAPSHOT_MAX_AGE_MS, plus one backstop tick, plus the read. The assertion is the GUARANTEE —
    // cleared within a bounded time without anything telling the panel — not one particular tick landing.
    await sleep(12_500); await settle()
    check(m.option('11:45') === '11:45 🟢',
      `a DROPPED dashboard refetch (no prop changes at all): the 10-second max-age backstop still clears it — "${before}" → "${m.option('11:45')}" (${server.slotsCalls} reads)`)
    await m.unmount() }

  console.log('\n── THE TWO TRIGGERS THE OPERATOR MAKES ──────────────────────────────────────────────────')
  { // adding an item to the basket → exactly ONE read inside the throttle window
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    server.board = INCOMING                                      // a time was taken while they were building
    await addItem(m); await sleep(700); await settle()
    check(server.slotsCalls === atRest + 1, `adding an item to the basket asks for exactly ${server.slotsCalls - atRest} read`)
    check(m.option('12:15') === '12:15 🔴 4 Pizzas', `…and the crosses and labels are drawn from the FRESH board: 12:15 reads "${m.option('12:15')}"`)
    await m.unmount() }
  { // opening the time dropdown → one read
    server.board = BASE; server.slotsCalls = 0
    const m = await mount(Panel, baseProps(BASE))
    await sleep(WINDOW_MS + 300)
    const atRest = server.slotsCalls
    server.board = CANCELLED
    await openDropdown(m); await sleep(700); await settle()
    check(server.slotsCalls === atRest + 1 && m.option('11:45') === '11:45 🟢',
      `opening the dropdown asks for ${server.slotsCalls - atRest} read and the list is current when it opens: "${m.option('11:45')}"`)
    await m.unmount() }

  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ every capacity input AND every status change invalidates the Add Order snapshot, and nothing else moves')
  process.exit(fails ? 1 : 0)
})()
