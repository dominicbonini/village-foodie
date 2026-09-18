#!/usr/bin/env node
// scripts/add-order-render.cjs
//
// RENDERS AddOrderPanel. That is the whole point of this file.
//   node scripts/add-order-render.cjs
//
// 🔴 WHAT A FAILURE LOOKS LIKE: the panel THROWS while rendering, so selecting a pizza blanks the
// dashboard. That is what shipped on 17 September: `manualFitWhy` (a useMemo, so it runs DURING render)
// called `readyToMins`, a `const` arrow declared ~75 lines BELOW it in the same component body. With an
// empty basket the memo returned early and never reached the call; the moment an item was added it did,
// and React threw `ReferenceError: Cannot access 'readyToMins' before initialization`.
//
// ⚠️ NEITHER tsc NOR next build CAN SEE IT. Both type-check a reference that appears earlier in source
// order quite happily — whether the binding is INITIALISED depends on the order the code RUNS. Every
// harness written for that change tested the ENGINE (fitOrderBackward, the message builder) and never
// rendered the component, so all of them passed while the panel was broken. The lesson is narrow and
// concrete: a change that adds render-time code to a component must render that component.
//
// HOW: `react-dom/server`'s renderToString — the repo has react-dom 19.2.3 and NO jsdom, happy-dom,
// linkedom, react-test-renderer or testing-library, and this harness adds no dependency. renderToString
// executes the component body and every useMemo/useCallback in it, which is exactly where this class of
// bug lives. It does NOT run useEffect, so effect-only code is not covered here (see §"not covered").
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { installMocks } = require('./_printing-mocks.cjs')

let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

// ── the module tree: compile TSX, then stand in for everything native ─────────────────────────────
function buildTree(root, tag) {
  const c = compile(root, ['components/dashboard/AddOrderPanel.tsx', 'components/printing/PrintingSettings.tsx', 'components/printing/PrinterTypeChoice.tsx'], tag,
    { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false })
  installMocks(c.out, { native: false })
  const stub = (pkg, body) => {
    const d = path.join(c.out, 'node_modules', ...pkg.split('/'))
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, main: 'index.js' }))
    fs.writeFileSync(path.join(d, 'index.js'), body)
  }
  fs.mkdirSync(path.join(c.out, 'node_modules', 'next'), { recursive: true })
  fs.writeFileSync(path.join(c.out, 'node_modules', 'next', 'package.json'), JSON.stringify({ name: 'next' }))
  stub('next/navigation', 'module.exports = { useParams: () => ({ token: "tok" }), useRouter: () => ({ push(){}, replace(){} }), usePathname: () => "/" }')
  // Every remaining native package: a Proxy that answers any call with a resolved promise. None of them
  // is reached during a server render; they exist so the module graph loads.
  for (const pkg of ['@capacitor/network', '@capacitor/app', '@capacitor/local-notifications', '@capacitor/keep-awake',
                     '@capacitor-community/keep-awake', '@capacitor/status-bar', '@capacitor/push-notifications',
                     '@aparajita/capacitor-biometric-auth', '@hatchgrab/net-printer'])
    stub(pkg, 'module.exports = new Proxy({}, { get: () => new Proxy(function(){}, { get: () => () => {}, apply: () => Promise.resolve({}) }) })')
  return c
}

// ── FIXTURE PROPS: an open event, 17:00–21:00, stored 8 @18:30 and 8 @19:00 ───────────────────────
const PIZZA = { secs: 900, batch: 8 }                       // prep 15 min, batch 8 — Dominic's grill
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const slotsFor = (iv) => { const o = []; for (let m = 17 * 60; m <= 21 * 60; m += iv) o.push({ collection_time: fmt(m), production_slot: fmt(m), available: true, is_grace: false, is_past: false }); return o }
const EVENT = { id: 'ev-fixture', event_date: '2099-01-01', start_time: '17:00', end_time: '21:00', venue_name: 'Fixture Field', status: 'open', van_id: null }
const MENU_ITEM = { id: 'i1', name: 'Margherita', price: 9, category: 'Pizza', is_available: true }
const offlineCapacityFor = (iv) => ({
  eventId: EVENT.id, slots: slotsFor(iv),
  productionSlotUnits: { '18:30': { pizza: 8 }, '19:00': { pizza: 8 } },
  kitchenCapacity: null, intervalMins: iv, capacityWindowMins: 5, eventStartMins: 17 * 60,
  catConfigs: { pizza: PIZZA },
})
const baseProps = (over = {}) => ({
  truck: { id: 'test-truck', name: 'Pizza Kitchen', plan: 'max', feature_overrides: {}, trial_expires_at: null, slug: 'test-kitchen' },
  truckMenu: { items: [MENU_ITEM], categories: [{ id: 'c1', name: 'Pizza' }] },
  menuGroups: { Pizza: [MENU_ITEM] },
  itemStocks: [], categoryStocks: [],
  categoryConfigs: { pizza: PIZZA }, categoryAllowNotes: { pizza: true },
  orders: [], waitMinutes: 10, token: 'fixture-token', pin: '',
  todayEvent: EVENT, categoryOrder: ['Pizza'], itemCategoryMap: { Margherita: 'Pizza' },
  showToast: () => {}, onOrderPlaced: () => {},
  isOffline: false, offlineCapacity: offlineCapacityFor(15), isEventLoaded: () => true,
  isActive: true, isDemo: false, buzzerCount: null, buzzerPromptEnabled: false,
  ...over,
})
/** A basket of N pizzas, in the shape manualItems holds. */
const basket = (n) => n <= 0 ? [] : [{ name: 'Margherita', quantity: n, unit_price: 9, cartKey: 'Margherita' }]

/**
 * Render the panel with `manualItems` seeded.
 * 🔴 WHY useState IS PATCHED: the basket is internal component state with no prop, so a server render
 * always starts it empty — and an empty basket is precisely the case that did NOT crash. `manualItems`
 * is the first `useState([])` in the body, so the first empty-array initialiser of each render is seeded
 * and the patch then stands down. THE SEEDING IS SELF-VERIFYING: if it ever targeted a different cell,
 * the 9-pizza assertion below (the verdict on 18:45) would stop holding and this harness fails.
 */
function renderPanel(React, renderToString, Panel, props, seed) {
  const realUseState = React.useState
  let armed = Array.isArray(seed) && seed.length > 0
  React.useState = function (init) {
    if (armed && Array.isArray(init) && init.length === 0) { armed = false; return realUseState(seed) }
    return realUseState(init)
  }
  try { return renderToString(React.createElement(Panel, props)) }
  finally { React.useState = realUseState }
}

const React = require('react')
const { renderToString } = require('react-dom/server')

console.log('── BROKEN VARIANT: MUST report FAILURE ──────────────────────────────────────────────────')
{
  // V1 — the ordering exactly as it shipped: `readyToMins` back inside the component body, BELOW the
  // memo that calls it. Rendering with a basket must throw the ReferenceError Dominic saw.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aor-v1-'))
  for (const d of ['components', 'lib', 'app']) if (fs.existsSync(path.join(REPO, d))) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  const f = path.join(tmp, 'components/dashboard/AddOrderPanel.tsx')
  let src = fs.readFileSync(f, 'utf8')
  const hoisted = 'function readyToMins(t: string): number { const [h, m] = t.split(\':\').map(Number); return (h || 0) * 60 + (m || 0) }\n'
  if (src.split(hoisted).length !== 2) { console.log('🔴 could not find the hoisted readyToMins to un-hoist'); process.exit(1) }
  src = src.replace(hoisted, '')
  const below = '  const queueAwareGridSlot = queueAware.readyTime'
  if (src.split(below).length !== 2) { console.log('🔴 could not find the original site to restore it to'); process.exit(1) }
  src = src.replace(below, "  const readyToMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }\n" + below)
  fs.writeFileSync(f, src)
  const vc = buildTree(tmp, 'aorV1')
  const VPanel = vc.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
  let threw = null
  try { renderPanel(React, renderToString, VPanel, baseProps(), basket(9)) } catch (e) { threw = e }
  const isTDZ = !!threw && /before initialization|is not defined/.test(String(threw.message))
  console.log(`  ${isTDZ ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 pre-fix ordering, 9 pizzas: ${threw ? threw.constructor.name + ': ' + threw.message.slice(0, 80) : 'rendered without throwing'}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  if (!isTDZ) process.exit(1)
}

const c = buildTree(REPO, 'aor')
const Panel = c.req('components/dashboard/AddOrderPanel.js').AddOrderPanel

console.log('\n── THE REAL PANEL RENDERS, EVERY CASE ───────────────────────────────────────────────────')
const CASES = [
  ['EMPTY basket, 15-minute grid', baseProps(), basket(0)],
  ['1 pizza, 15-minute grid', baseProps(), basket(1)],
  ['9 pizzas, 15-minute grid', baseProps(), basket(9)],
  ['9 pizzas, 5-minute grid', baseProps({ offlineCapacity: offlineCapacityFor(5) }), basket(9)],
  ['1 pizza, 5-minute grid', baseProps({ offlineCapacity: offlineCapacityFor(5) }), basket(1)],
  ['9 pizzas, NO capacity data', baseProps({ offlineCapacity: null }), basket(9)],
  ['EMPTY basket, NO capacity data', baseProps({ offlineCapacity: null }), basket(0)],
  // P3: the switch ON, Dominic's case (8 @17:00, 1 @17:15) — 9 @17:30 fits ON and is refused OFF.
  ['9 pizzas, switch ON, worked-case board', baseProps({ offlineCapacity: { ...offlineCapacityFor(15), productionSlotUnits: { '17:00': { pizza: 8 }, '17:15': { pizza: 1 } }, reservations: [], batchReservations: true } }), basket(9)],
  ['9 pizzas, switch OFF, worked-case board', baseProps({ offlineCapacity: { ...offlineCapacityFor(15), productionSlotUnits: { '17:00': { pizza: 8 }, '17:15': { pizza: 1 } }, reservations: [], batchReservations: false } }), basket(9)],
]
const html = {}
for (const [label, props, seed] of CASES) {
  let out = null, err = null
  try { out = renderPanel(React, renderToString, Panel, props, seed) } catch (e) { err = e }
  html[label] = out
  check(!err, `${label} — ${err ? err.constructor.name + ': ' + err.message.slice(0, 90) : `rendered ${out.length} bytes, no throw`}`)
}

console.log('\n── AND IT RENDERS THE RIGHT THING ───────────────────────────────────────────────────────')
{
  // React separates adjacent text nodes with `<!-- -->` markers, so the rendered option reads
  // `18:45<!-- --> <!-- -->🟢<!-- --> Not enough time`. Strip those markers and read the markup the way a
  // person sees it; the apostrophe may be a literal ’ or an entity depending on the source.
  const plain = (h) => (h || '').replace(/<!-- -->/g, '')
  // 19 September 2026: "Order won't fit" → "Won't fit" → "Not enough time"; green or amber dots only.
  const LABEL = /Not enough time/
  const OLD_LABEL = /Order won(?:&#x27;|&#39;|’|')t fit|Won(?:&#x27;|&#39;|’|')t fit/
  /** The label state of one time in the rendered <select>. */
  const optionFor = (h, time) => {
    const m = plain(h).match(new RegExp(`<option value="${time}"[^>]*>([\\s\\S]*?)</option>`))
    return m ? m[1] : null
  }
  const labelled = (h, time) => { const o = optionFor(h, time); return o != null && LABEL.test(o) }

  const nine = html['9 pizzas, 15-minute grid']
  check(labelled(nine, '18:45'), `9 pizzas: the 18:45 option carries "Not enough time" → ${JSON.stringify(optionFor(nine, '18:45'))}`)
  // ── THE SEPARATOR AND THE RED RULE (19 September 2026) ─────────────────────────────────────────
  // " · " after an existing label; a single space after a bare dot — the old " – " form is gone from
  // THIS label. And on a RED dot the suffix is not rendered at all: the colour already says the
  // kitchen cannot take more, and "Full · Order won't fit" said it twice.
  {
    console.log('  ── BROKEN VARIANTS: MUST report FAILURE ──')
    // V2: the suffix rendered on a RED dot — 18:30 is red with its own count ("8 Pizzas").
    const v2 = optionFor(nine, '18:30') + ' · Not enough time'
    const bad2 = /🔴[^<]*Not enough time/.test(v2)
    console.log(`  ${bad2 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 the suffix on a red dot: ${JSON.stringify(v2)}`)
    if (!bad2) process.exit(1)
    // V3: the long wording restored in the list.
    const v3 = optionFor(nine, '18:45').replace(/Not enough time/, 'Order won’t fit')
    const bad3 = OLD_LABEL.test(v3)
    console.log(`  ${bad3 ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 the long "Order won't fit" restored: ${JSON.stringify(v3)}`)
    if (!bad3) process.exit(1)
    const bare = optionFor(nine, '18:45')
    check(/🟢 Not enough time/.test(bare), `bare dot → the label alone, no dash: ${JSON.stringify(bare)}`)
    check(!/[–·] *Not enough/.test(bare), '…and no separator of any kind precedes it after a bare dot')
    check(!OLD_LABEL.test(plain(nine)), 'neither retired wording ("Order won\'t fit", "Won\'t fit") appears anywhere in the list')
    // RED dots carry NO suffix, whatever their own label is.
    const reds = [...plain(nine).matchAll(/<option value="(\d\d:\d\d)"[^>]*>([^<]*🔴[^<]*)<\/option>/g)]
    check(reds.length > 0 && reds.every(m => !LABEL.test(m[2])), `${reds.length} red option(s), none carrying the suffix: ${JSON.stringify(reds.map(m => m[2].trim()).slice(0, 3))}`)
    check(/8 Pizzas/.test(optionFor(nine, '18:30')) && !LABEL.test(optionFor(nine, '18:30')), `a red count keeps its count and drops the verdict: ${JSON.stringify(optionFor(nine, '18:30'))}`)
  }
  check(!labelled(nine, '19:30'), `9 pizzas: 19:30 is NOT labelled — it fits → ${JSON.stringify(optionFor(nine, '19:30'))}`)
  check(/color:#94a3b8/.test(plain(nine).match(/<option value="18:45"[^>]*>/)[0]), '…and that option is greyed, while staying a normal selectable option')

  const empty = html['EMPTY basket, 15-minute grid']
  check(!LABEL.test(plain(empty)), 'EMPTY basket: no fit label anywhere in the list')
  check(/<option value="18:30"[^>]*>[^<]*🔴/.test(plain(empty)), '…and the dots are still there, unchanged')

  const one = html['1 pizza, 15-minute grid']
  check(!labelled(one, '18:45'), `1 pizza: 18:45 is NOT labelled — it fits → ${JSON.stringify(optionFor(one, '18:45'))}`)
  check(!labelled(one, '18:30'), `1 pizza: 18:30 does not fit, but its dot is RED so the verdict is not repeated → ${JSON.stringify(optionFor(one, '18:30'))}`)

  const noData = html['9 pizzas, NO capacity data']
  check(!LABEL.test(plain(noData)), 'NO capacity data: no label at all — never a verdict without inputs')

  const five = html['9 pizzas, 5-minute grid']
  check(labelled(five, '18:45'), `5-minute grid, 9 pizzas: 18:45 labelled → ${JSON.stringify(optionFor(five, '18:45'))}`)

  // The dot and its own label must be untouched by all of this.
  check(/8 Pizzas/.test(plain(nine)), 'the time list still carries its "{n} Pizzas" dot labels')
  // P3: the same board, switch OFF vs ON — 17:30 is labelled OFF (today's split refuses 9) and NOT ON.
  const on = html['9 pizzas, switch ON, worked-case board'], off = html['9 pizzas, switch OFF, worked-case board']
  check(labelled(off, '17:30'), `switch OFF, worked-case board: 17:30 labelled → ${JSON.stringify(optionFor(off, '17:30'))}`)
  check(!labelled(on, '17:30'), `switch ON, same board: 17:30 NOT labelled — 9 fits as 8 + 1 → ${JSON.stringify(optionFor(on, '17:30'))}`)
}

console.log('\n── THE OTHER RECENTLY CHANGED COMPONENTS ────────────────────────────────────────────────')
{
  const PT = c.req('components/printing/PrinterTypeChoice.js').PrinterTypeChoice
  const PS = c.req('components/printing/PrintingSettings.js').PrintingSettings
  const g = global.__hg
  // Both gate on the native shell, so render each BOTH ways: on web (where each must return null — its
  // documented gate) and as the native app with the plugin present (where the body actually runs).
  for (const [envLabel, native, plugin] of [['web', false, false], ['native app, plugin present', true, true]]) {
    g.native = native; g.pluginAvailable = plugin
    let e1 = null, o1 = ''
    try { o1 = renderToString(React.createElement(PT, { kind: 'ble', onChoose: () => {} })) } catch (e) { e1 = e }
    check(!e1, `PrinterTypeChoice (${envLabel}) — ${e1 ? e1.constructor.name + ': ' + e1.message.slice(0, 70) : (o1 ? `rendered ${o1.length} bytes, contains "Printer type": ${/Printer type/.test(o1)}` : 'rendered nothing (gated off, correct)')}`)
    let e2 = null, o2 = ''
    try { o2 = renderToString(React.createElement(PS, { plan: 'max', featureOverrides: {}, trialExpiresAt: null, mode: 'lead_time', onChangeMode: async () => {} })) } catch (e) { e2 = e }
    // ⚠️ PARTIAL COVERAGE, STATED: PrintingSettings opens `if (!isNativeApp() || !ready) return null`,
    // and `ready` is set inside a useEffect — which renderToString never runs. So its BODY is
    // unreachable under server rendering whatever the platform mock says; this asserts only that its
    // gate evaluates without throwing. A TDZ bug below that gate would NOT be caught here.
    check(!e2, `PrintingSettings   (${envLabel}) — ${e2 ? e2.constructor.name + ': ' + e2.message.slice(0, 70) : (o2 ? `rendered ${o2.length} bytes` : 'gate only: returns null until `ready`, which a useEffect sets — body not reachable by renderToString')}`)
  }
  g.native = false; g.pluginAvailable = true

  // 🔴 THE COLLECTION TIMES BOX CANNOT BE RENDERED IN ISOLATION, and that is a fact about the code, not
  // a gap in this harness: it is inline JSX inside app/dashboard/[token]/page.tsx (around line 4971),
  // not a component. Rendering it means rendering DashboardPage — a ~5,000-line client component that
  // needs a route token, an authenticated /api/dashboard fetch and a dozen effects. Extracting it is a
  // refactor of a file this work is forbidden to touch, so it is REPORTED, not faked.
  const page = fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/page.tsx'), 'utf8')
  check(/<p className="text-sm font-semibold text-slate-800">Collection times<\/p>/.test(page), 'Collection times is inline JSX in the dashboard page — not separately renderable (see the note above)')
}

console.log('\n── THE MEMO DEPENDENCIES ARE REFERENTIALLY STABLE ───────────────────────────────────────')
{
  // A useMemo whose dependency is rebuilt every render is not a memo. `capacityInputs` was an object
  // literal in the offline branch, and `?? []` / `?? {}` minted fresh empties — so slotIndicators,
  // manualFitWhy and manualPlacement all recomputed on every keystroke while offline. Demonstrated:
  const offline = { slots: [], catConfigs: {} }
  const oldWay = () => (offline ? { productionSlotUnits: {}, kitchenCapacity: null } : null)
  check(oldWay() !== oldWay(), 'the OLD object-literal form yields a different identity each render (the defect)')

  const panel = fs.readFileSync(path.join(REPO, 'components/dashboard/AddOrderPanel.tsx'), 'utf8')
  check(/const capacityInputs = useMemo\(\(\) => apiCapacityInputs \?\?/.test(panel), 'capacityInputs is now built inside useMemo')
  check(/\}\s*:\s*null\), \[apiCapacityInputs, offlineForThisEvent\]\)/.test(panel), '…keyed on [apiCapacityInputs, offlineForThisEvent], both stable')
  check(/offlineForThisEvent\?\.slots \?\? EMPTY_SLOTS/.test(panel), 'manualSlots falls back to the shared EMPTY_SLOTS, not a fresh []')
  check(/offlineForThisEvent\?\.catConfigs \?\? EMPTY_CAT_CONFIGS/.test(panel), 'serverCatConfigs falls back to the shared EMPTY_CAT_CONFIGS, not a fresh {}')
  check(!/\?\? \[\]\)$/m.test(panel.split('const manualSlots')[1]?.split('\n')[0] ?? ''), 'no `?? []` remains on the manualSlots line')
  // The fields themselves must be untouched — this was a change of identity, not of value.
  for (const f of ['intervalMins:', 'productionSlotUnits:', 'kitchenCapacity:', 'capacityWindowMins:', 'eventStartMins:', 'eventEndMins: null', 'earliestCollectionMins: 0'])
    check(panel.includes(f), `capacityInputs still carries ${f}`)
}

console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ AddOrderPanel renders with every fixture basket; the label appears exactly where it should'}`)
process.exit(fails ? 1 : 0)
