#!/usr/bin/env node
// scripts/dot-overlap-labels.cjs — the time-list dots show a time blocked by an OVERLAPPING batch.
//   node scripts/dot-overlap-labels.cjs       (≈ 2 min: six compiles, one of them the real panel)
//
// 🔴 FIFTH FAILURE MODE (19 September 2026): a RED dot labelled with a number SMALLER than the batch —
// "🔴 1 Pizza" on a batch of 8. A window carries two numbers per category: the items seated in it
// (`byCat`, which the label read) and the rolling load over its span (`batch − remainingByCat`, which
// the tone read). Dominic's board: one pizza seated 21:45–22:00, ten on the grill across that span. The
// label now reads the tone's number, so on every red dot the number is at least the batch (or the
// ceiling) unless an override put more in — asserted as a sweep below.
//
// 🔴 FAILURE MODE (Dominic, test-truck, prep 15 / batch 8, customer times every 5 minutes): with 8 pizzas
// @17:00 and 1 @17:15 stored, the list read "17:05 🟢 – Order won't fit" — a green dot with no count on a
// time every pizza order is refused at, because the dot read only the load booked at 17:05's own window
// and the 16:45–17:00 batch merely overlaps it. Every line below is FIXTURE data through the real engine.
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const { installMocks } = require('./_printing-mocks.cjs')
let fails = 0
const toMins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
// 19 September 2026: an Add Order row leads with the refusal marker — '✕ ' when this order cannot be ready
// by then, a same-width en space when it can, and NOTHING at all on an empty order. Label and verdict
// assertions read the row with it stripped; the marker itself is asserted on its own below.
const MARK_RE = /^[\u00d7\u2007]\u0020/
const stripMark = (t) => String(t || '').replace(MARK_RE, '')
const check = (ok, l) => { console.log(`  ${ok ? '✓' : '🔴'} ${l}`); if (!ok) fails++ }
const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const NEG = Number.NEGATIVE_INFINITY

// ── module trees: the working tree, and patched copies for the broken variants ──────────────────
const ENGINE_FILES = ['lib/slot-availability.ts', 'lib/slot-display.ts', 'lib/slot-generation.ts']
function engine(root, tag) { const c = compile(root, ENGINE_FILES, tag); return { E: c.req('lib/slot-availability.js'), D: c.req('lib/slot-display.js'), G: c.req('lib/slot-generation.js'), out: c.out } }
function variantRoot(tag, patches) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dot-${tag}-`))
  for (const d of ['lib', 'components', 'app']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules'))
  for (const [rel, from, to] of patches) {
    const f = path.join(tmp, rel); const src = fs.readFileSync(f, 'utf8')
    if (src.split(from).length !== 2) { console.log(`🔴 ${tag}: patch anchor not found exactly once in ${rel}: ${from.slice(0, 70)}`); process.exit(1) }
    fs.writeFileSync(f, src.replace(from, to))
  }
  return tmp
}
const grid = (X, start, end, iv) => X.G.generateCollectionTimes(fmt(start), fmt(end), iv, iv, 30).map(t => ({ collection_time: t.collection_time, production_slot: t.production_slot ?? t.collection_time }))
/** The list as the operator surfaces print it with NO order: "HH:MM emoji[ label]". */
const lines = (X, cx, units, res = [], on = false) => {
  const times = grid(X, cx.start, cx.end, cx.iv)
  const ind = X.D.buildSlotIndicators(times, units, cx.cfg, cx.kc ?? null, cx.start, cx.order ?? Object.keys(cx.cfg), cx.cw ?? 5, cx.iv, res, on)
  return Object.fromEntries(times.map(t => { const i = ind.get(t.collection_time); return [t.collection_time, `${t.collection_time} ${i.emoji}${i.label ? ' ' + i.label : ''}`] }))
}
const PIZZA15 = { pizza: { secs: 900, batch: 8 } }
const DOMINIC = { cfg: PIZZA15, start: 17 * 60, end: 21 * 60, iv: 5, kc: null }
const DOMINIC_UNITS = { '17:00': { pizza: 8 }, '17:15': { pizza: 1 } }
// 19 September 2026 — the SPAN TOTAL: 17:05's stretch [16:50, 17:05) covers the 8 cooking 16:45–17:00 AND
// the 1 cooking 17:00–17:15, so nine pizzas come out of it. The PEAK across it is 8 (they are back to
// back), which is what the colour still reads — red either way, because 8 is the batch.
const EXPECT = { '17:00': '17:00 🔴 8 Pizzas', '17:05': '17:05 🔴 9 Pizzas', '17:10': '17:10 🔴 9 Pizzas', '17:15': '17:15 🟡 1 Pizza' }
// 🔴 THE TABLE THIS CHANGE WAS BUILT TO (docs/dot-label-cooking-counts-report.md §4, measured before any
// code moved and approved by Dominic). 8 pizzas collected 21:45 cook 21:30–21:45; 5 collected 22:10 cook
// 21:55–22:10. Four listed times share the first batch and five share the second, so each shows that
// batch's count — not a limit, and not what is collected at that time.
const C3 = { cfg: PIZZA15, start: 17 * 60, end: 22 * 60 + 30, iv: 5, kc: null }
const C3_UNITS = { '21:45': { pizza: 8 }, '22:10': { pizza: 5 } }
const C3_TIMES = ['21:40', '21:45', '21:50', '21:55', '22:00', '22:05', '22:10', '22:15', '22:20', '22:25']
// 🔴 DOMINIC'S BOARD, 17 September 2026 (test-truck event 7a98c341, read-only SQL in docs/dot-label-red-
// total-report.md): every occupying order's pizzas by collection time. Pizza prep 15 / batch 8, kc NULL,
// 5-minute grid, event 17:00–23:00. Orders #12 8@21:45, #13 2@21:50, #19 2@21:55, #18 1@22:00, #20 5@22:10
// make the strip; the earlier ones are there so the state is the real one. Stored reservations were
// recorded at batch 2 / prep 5 and are INVALID under the current category (validReservationsAt), so the
// engine seats every order afresh — carrying them or not renders identically (measured).
const BOARD = { cfg: PIZZA15, start: 17 * 60, end: 23 * 60, iv: 5, kc: null }
const BOARD_UNITS = { '17:15': { pizza: 9 }, '18:15': { pizza: 8 }, '19:00': { pizza: 8 }, '19:15': { pizza: 8 }, '20:55': { pizza: 16 }, '21:05': { pizza: 4 }, '21:15': { pizza: 2 }, '21:20': { pizza: 1 }, '21:25': { pizza: 1 }, '21:45': { pizza: 8 }, '21:50': { pizza: 2 }, '21:55': { pizza: 2 }, '22:00': { pizza: 1 }, '22:10': { pizza: 5 } }
// 🔴 DOMINIC'S 10-ON-5 CASE (19 September 2026): a 5-minute cook on 10-minute collection times, batch 2.
// Two full batches — 2 collected 10:35 (cooking 10:30–10:35) and 2 collected 10:40 (10:35–10:40) — fall inside
// the ten minutes the 10:40 dot covers, so it reads the 4 that come out of that stretch. The PEAK is 2.
const TEN_ON_FIVE = { cfg: { pizza: { secs: 300, batch: 2 } }, start: 10 * 60, end: 11 * 60, iv: 10, kc: null }
const TEN_ON_FIVE_UNITS = { '10:35': { pizza: 2 }, '10:40': { pizza: 2 } }
// The span total exceeding the batch with NOTHING overbooked: three back-to-back batches of 2 on a batch of 4,
// covered by one 15-minute dot. Total 6, peak 2 ⇒ amber, and a small order still fits.
const OVER_TOTAL = { cfg: { pizza: { secs: 300, batch: 4 } }, start: 10 * 60, end: 11 * 60, iv: 15, kc: null }
const OVER_TOTAL_UNITS = { '10:35': { pizza: 2 }, '10:40': { pizza: 2 }, '10:45': { pizza: 2 } }
// 30-minute times on a 15-minute cook, batch 8 — the two worked examples from the measurement.
const THIRTY_ON_FIFTEEN = { cfg: { pizza: { secs: 900, batch: 8 } }, start: 17 * 60, end: 19 * 60, iv: 30, kc: null }
const THIRTY_ON_FIFTEEN_UNITS = { '17:45': { pizza: 4 }, '18:00': { pizza: 5 }, '18:15': { pizza: 5 }, '18:30': { pizza: 7 } }
const BOARD_TIMES = ['21:45', '21:50', '21:55', '22:00', '22:05', '22:10', '22:15', '22:20', '22:25']
// 19 September 2026 — the SPAN TOTAL is what comes out of each stretch, while the COLOUR stays the peak.
// 21:50's fifteen minutes cover the 8, both 2s and the 1 = 13 cooked, with never more than 12 in the oven
// at once (red: 12 ≥ the batch of 8). 22:00's stretch covers 2 + 2 + 1 + 5 = 10 cooked with a peak of 6 —
// AMBER, because at no instant is the oven over its batch. Nothing is overbooked at any of them.
const BOARD_EXPECT = { '21:45': '🔴 12 Pizzas', '21:50': '🔴 13 Pizzas', '21:55': '🔴 13 Pizzas', '22:00': '🟡 10 Pizzas', '22:05': '🟡 8 Pizzas', '22:10': '🟡 6 Pizzas', '22:15': '🟡 5 Pizzas', '22:20': '🟡 5 Pizzas', '22:25': '🟢' }
// Dominic's SECOND case: 16 pizzas collected at 20:55 on the same 5-minute grid. Two shapes are checked —
// the order as the fixed admission stores it (two windows of 8), and as the PRE-FIX override record stored
// it (all 16 in the one window 20:40–20:55, docs/sixteen-pizza-bug-report.md), which is the shape that
// reproduces the four times he reported.
const C2 = { cfg: PIZZA15, start: 17 * 60, end: 21 * 60, iv: 5, kc: null }
const C2_UNITS = { '20:55': { pizza: 16 } }
const C2_FIT = [{ orderKey: 'k', slot: '20:55', source: 'fit', cats: { pizza: { items: 16, batch: 8, prepMins: 15, windows: [{ startMins: 1225, endMins: 1240, items: 8 }, { startMins: 1240, endMins: 1255, items: 8 }] } } }]
const C2_OVERRIDE = [{ orderKey: 'k', slot: '20:55', source: 'override', cats: { pizza: { items: 16, batch: 8, prepMins: 15, windows: [{ startMins: 1240, endMins: 1255, items: 16 }] } } }]

// ── the real panel (for the "with 2 pizzas" lines and the with-order "next free") ───────────────
function buildPanel(root, tag) {
  const c = compile(root, ['components/dashboard/AddOrderPanel.tsx', 'components/printing/PrintingSettings.tsx', 'components/printing/PrinterTypeChoice.tsx'], tag, { jsx: 'react-jsx', skipLibCheck: true, noImplicitAny: false })
  installMocks(c.out, { native: false })
  const stub = (pkg, body) => { const d = path.join(c.out, 'node_modules', ...pkg.split('/')); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, main: 'index.js' })); fs.writeFileSync(path.join(d, 'index.js'), body) }
  fs.mkdirSync(path.join(c.out, 'node_modules', 'next'), { recursive: true }); fs.writeFileSync(path.join(c.out, 'node_modules', 'next', 'package.json'), JSON.stringify({ name: 'next' }))
  stub('next/navigation', 'module.exports = { useParams: () => ({ token: "tok" }), useRouter: () => ({ push(){}, replace(){} }), usePathname: () => "/" }')
  for (const pkg of ['@capacitor/network', '@capacitor/app', '@capacitor/local-notifications', '@capacitor/keep-awake', '@capacitor-community/keep-awake', '@capacitor/status-bar', '@capacitor/push-notifications', '@aparajita/capacitor-biometric-auth', '@hatchgrab/net-printer'])
    stub(pkg, 'module.exports = new Proxy({}, { get: () => new Proxy(function(){}, { get: () => () => {}, apply: () => Promise.resolve({}) }) })')
  return c.req('components/dashboard/AddOrderPanel.js').AddOrderPanel
}
const React = require('react'); const { renderToString } = require('react-dom/server')
const EVENT = { id: 'ev-dot', event_date: '2099-01-01', start_time: '17:00', end_time: '22:30', venue_name: 'Fixture', status: 'open', van_id: null }
const MENU_ITEM = { id: 'i1', name: 'Margherita', price: 9, category: 'Pizza', is_available: true }
function panelProps(X, units, on, endMins, cx) {
  const cfg = cx?.cfg ?? PIZZA15
  const start = cx?.start ?? 17 * 60
  const iv = cx?.iv ?? 5
  const kc = cx?.kc ?? null
  const slots = grid(X, start, endMins ?? 21 * 60, iv).map(s => ({ ...s, available: true, is_grace: false, is_past: false }))
  return { truck: { id: 'test-truck', name: 'Pizza Kitchen', plan: 'trial', feature_overrides: { batch_reservations: on }, trial_expires_at: null, slug: 'test-kitchen' },
    truckMenu: { items: [MENU_ITEM], categories: [{ id: 'c1', name: 'Pizza' }] }, menuGroups: { Pizza: [MENU_ITEM] }, itemStocks: [], categoryStocks: [],
    categoryConfigs: cfg, categoryAllowNotes: { pizza: true }, orders: [], waitMinutes: 10, token: 'fixture-token', pin: '', todayEvent: EVENT, categoryOrder: ['Pizza'],
    itemCategoryMap: { Margherita: 'Pizza' }, showToast: () => {}, onOrderPlaced: () => {}, isOffline: false, isEventLoaded: () => true, isActive: true, isDemo: false, buzzerCount: null, buzzerPromptEnabled: false,
    offlineCapacity: { eventId: EVENT.id, slots, productionSlotUnits: units, kitchenCapacity: kc, intervalMins: iv, capacityWindowMins: 5, eventStartMins: start, catConfigs: cfg, reservations: [], batchReservations: on } }
}
/** The panel's rendered markup for one basket — the source every row reader below works from. */
function panelHtml(Panel, X, units, n, on, endMins, cx) {
  const realUseState = React.useState; let armed = n > 0
  React.useState = function (init) { if (armed && Array.isArray(init) && init.length === 0) { armed = false; return realUseState([{ name: 'Margherita', quantity: n, unit_price: 9, cartKey: 'Margherita' }]) } return realUseState(init) }
  try { return renderToString(React.createElement(Panel, panelProps(X, units, on, endMins, cx))) } finally { React.useState = realUseState }
}
/**
 * Rows WITH the leading refusal marker intact. ⚠️ The blank marker is a FIGURE SPACE (U+2007), which `\s`
 * matches — so the usual collapse-and-trim would erase the very thing these assertions read. The lead is
 * taken off first, the rest is normalised, and the lead is put back.
 */
function panelRaw(Panel, X, units, n, on, endMins, cx) {
  const html = panelHtml(Panel, X, units, n, on, endMins, cx)
  const sel = html.slice(html.indexOf('<select'), html.indexOf('</select>'))
  const out = {}
  for (const m of sel.matchAll(/<option[^>]*value="(\d\d:\d\d)"[^>]*>([\s\S]*?)<\/option>/g)) {
    const text = m[2].replace(/<!-- -->/g, '').replace(/&#x27;|&#39;/g, '\u2019').replace(/&#x2013;|&ndash;/g, '\u2013')
    const lead = /^(\u00d7\u0020|\u2007\u0020)/.exec(text)
    const mark = lead ? lead[1] : ''
    out[m[1]] = mark + text.slice(mark.length).replace(/\s+/g, ' ').trim()
  }
  return out
}
/** Rows with the marker STRIPPED — label and verdict assertions read these. */
function panelLines(Panel, X, units, n, on, endMins, cx) {
  const raw = panelRaw(Panel, X, units, n, on, endMins, cx)
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, stripMark(v)]))
}

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  // V1 — today's exact-time read: the rolling read discarded (tone = the window's; no overlap reason).
  const V1 = ['lib/slot-availability.ts', "  const tone: SlotTone = RANK[overlapTone] > RANK[windowTone] ? overlapTone : windowTone", "  const tone: SlotTone = windowTone"]
  const V1b = ['lib/slot-availability.ts', "  if (bindCat && RANK[overlapTone] > RANK[windowTone]) {", "  if (false) {"]
  { const X = engine(variantRoot('v1', [V1, V1b]), 'dotV1'); const L = lines(X, DOMINIC, DOMINIC_UNITS)
    const bad = L['17:05'] !== EXPECT['17:05']
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 today's exact-time read: "${L['17:05']}"`); if (!bad) process.exit(1) }
  // V2 — another time's count repeated on the overlapped time.
  { // the overlapping batch's OWN window composition shown on the overlapped time — "8 Pizzas" on 17:05.
    const X = engine(variantRoot('v2', [['lib/slot-display.ts', "    const label = overlap\n      ? countLabel([...Object.entries(read.perCat).map(([cat]) => [cat, spanNumber(cat, 0)] as [string, number]), ...instants], rankOf)\n      : ownLabel", "    const label = overlap ? (() => { const ov = [...back.windows].reverse().find(x => x.startMins < toMins(s.collection_time) - step && Object.values(x.byCat).some(v => Number(v) > 0)); return ov ? Object.entries(ov.byCat).map(([c, n]) => `${n} ${capWord(c)}s`).join(', ') : '' })() : ownLabel"]]), 'dotV2')
    const L = lines(X, DOMINIC, DOMINIC_UNITS); const bad = /\d+ Pizzas?/.test(L['17:05'])
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 the 17:00 count repeated: "${L['17:05']}"`); if (!bad) process.exit(1) }
  // V3 — "Full" restored on an overlapped time: the old wording back in place of the counts.
  { const X = engine(variantRoot('v3', [['lib/slot-display.ts',
      "    const label = overlap\n      ? countLabel([...Object.entries(read.perCat).map(([cat]) => [cat, spanNumber(cat, 0)] as [string, number]), ...instants], rankOf)\n      : ownLabel",
      "    const label = overlap ? (overlap.kind === 'kitchen' ? 'Kitchen full' : 'Full') : ownLabel"]]), 'dotV3')
    const L = lines(X, DOMINIC, DOMINIC_UNITS); const bad = /Full/.test(L['17:05'])
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 "Full" restored on an overlapped time: "${L['17:05']}"`); if (!bad) process.exit(1) }
  // V3b — the overlap rule applied to ownLabel TOO, so a time with its own window loses it. §31's
  // event-start pile is the case that breaks first: its raw piled count (6) becomes the run-up window (2).
  { const X = engine(variantRoot('v3b', [['lib/slot-display.ts',
      "    const label = overlap\n      ? countLabel([...Object.entries(read.perCat).map(([cat]) => [cat, spanNumber(cat, 0)] as [string, number]), ...instants], rankOf)\n      : ownLabel",
      "    const label = countLabel(Object.entries(read.perCat).map(([cat, r]) => [cat, r.used] as [string, number]), rankOf)"]]), 'dotV3b')
    const L = lines(X, { cfg: { pizza: { secs: 300, batch: 4 } }, start: 16 * 60 + 30, end: 17 * 60 + 30, iv: 5, kc: null }, { '16:30': { pizza: 6 } })
    const bad = L['16:30'] !== '16:30 🔴 6 Pizzas'
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3b the rule applied to ownLabel too — §31's pile reads: "${L['16:30']}" (must be "16:30 🔴 6 Pizzas")`); if (!bad) process.exit(1) }
  // V9 — the window's own SEATED items (`byCat`) as the label, instead of the span total. Dominic's
  // 22:00 must read "1 Pizza" again — one seated, ten cooked across the stretch.
  { const X = engine(variantRoot('v9', [['lib/slot-display.ts',
      "[cat, spanNumber(cat, Number(n))] as [string, number]", "[cat, Number(n)] as [string, number]"]]), 'dotV9')
    const L = lines(X, BOARD, BOARD_UNITS); const bad = / 1 Pizza$/.test(L['22:00'])
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V9 the seated count as the label — Dominic's 22:00: "${L['22:00']}"`); if (!bad) process.exit(1) }
  // V11 — the PEAK used as the label (what it read before this change). Dominic's 10-on-5 case must FAIL:
  // two full batches of 2 inside one dot's ten minutes read "2 Pizzas" instead of the 4 that come out.
  { const X = engine(variantRoot('v11', [['lib/slot-display.ts',
      "      const from = T - Math.max(prep, intervalMins)", "      const from = T - prep"]]), 'dotV11')
    const L = lines(X, TEN_ON_FIVE, TEN_ON_FIVE_UNITS); const bad = L['10:40'] === '10:40 🔴 2 Pizzas'
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V11 the peak as the label — 10-on-5 with two full batches: "${L['10:40']}" (must be "10:40 🔴 4 Pizzas")`); if (!bad) process.exit(1) }
  // V12 — the span TOTAL used for the COLOUR as well. Three back-to-back batches of 2 on a batch of 4
  // total 6 but never put more than 2 in the oven: the dot must stay amber, and this variant reds it.
  { const X = engine(variantRoot('v12', [['lib/slot-availability.ts',
      "    const used = categoryLoadOver(back.intervals, cat, slotMins - prepMins, slotMins)",
      "    const used = (() => { let t = 0; const f = slotMins - Math.max(prepMins, displayIntervalMins); for (const iv of back.intervals) { if (iv.cat !== cat || iv.items <= 0 || iv.endMins <= iv.startMins) continue; if (iv.startMins < slotMins && f < iv.endMins) t += iv.items } return t })()"]]), 'dotV12')
    const L = lines(X, OVER_TOTAL, OVER_TOTAL_UNITS); const bad = /🔴/.test(L['10:45'] || '')
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V12 the total used for the colour — total 6 on a batch of 4, peak 2: "${L['10:45']}" (must stay amber)`); if (!bad) process.exit(1) }
  // V10 — the label taking the LARGEST SINGLE batch in the span rather than the span's TOTAL: the 10-on-5
  // case would read 2 (one batch) where 4 come out of the ten minutes the dot covers.
  { const X = engine(variantRoot('v10', [['lib/slot-display.ts',
      "        if (iv.startMins < T && from < iv.endMins) total += iv.items          // half-open, each batch once",
      "        if (iv.startMins < T && from < iv.endMins) total = Math.max(total, iv.items)"]]), 'dotV10')
    const L = lines(X, TEN_ON_FIVE, TEN_ON_FIVE_UNITS); const bad = L['10:40'] !== '10:40 🔴 4 Pizzas'
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V10 the largest single batch instead of the span total — 10:40: "${L['10:40']}" (must be "10:40 🔴 4 Pizzas")`); if (!bad) process.exit(1) }
  // V4b — the POPUP stripped of its own per-window detail. The popup is a DIFFERENT surface with a
  // DIFFERENT job: the dot says this time is full, the popup says which batch and how much room it has.
  // ⚠️ THE POPUP HAS NEVER CONTAINED "next free" (lib/slot-fit-message.ts: 0 occurrences, before and
  // after), so a variant that strips that exact phrase from it would be a no-op and prove nothing. This
  // strips the wording the popup DOES carry for the same purpose — each window's free room — and the
  // check below catches it.
  { const V = compile(variantRoot('v4b', [['lib/slot-fit-message.ts',
      "        else if (win.free >= win.share) lines.push(`${span} · ${win.free} free`)",
      "        else if (win.free >= win.share) lines.push(`${span}`)"]]), ['lib/slot-fit-message.ts', 'lib/slot-availability.ts'], 'dotV4b')
    const M = V.req('lib/slot-fit-message.js'), EV = V.req('lib/slot-availability.js')
    const back = EV.projectBackwardOccupancy({ '17:00': { pizza: 5 } }, PIZZA15, 17 * 60, null, 5, [], true)
    const fit = EV.fitOrderBackward(back, mins('17:05'), { pizza: 9 }, PIZZA15, null, 17 * 60, 5, NEG, {}, true)
    const msg = M.buildFitMessage({ slotLabel: '17:05', why: fit.why, catLabel: c => c })
    const bad = !msg.lines.some(l => /\d+ free/.test(l))
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V4b the popup stripped of its free-room detail: ${JSON.stringify(msg.lines)}`); if (!bad) process.exit(1) }
  // V4 — operator detail leaking onto the customer surface (/api/slots rows).
  { const X = engine(variantRoot('v4', [['lib/slot-availability.ts', "      tone,\n      bound_by: boundBy,\n    }\n  })", "      tone,\n      bound_by: boundBy,\n      label: (read0 => read0 && read0.overlap ? `Full – next free` : '')(hasBasket ? null : dotOccupancyAt(back, slotMins, prevOf(slotMins), step, eventStartMins, catConfigs, kitchenCapacity, displayInterval, batchReservations === true)),\n    }\n  })"]]), 'dotV4')
    const rows = X.E.buildSlotAvailability({ times: grid(X, 17 * 60, 21 * 60, 5), productionSlotUnits: DOMINIC_UNITS, catConfigs: PIZZA15, kitchenCapacity: null, capacityWindowMins: 5, date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: 17 * 60, displayIntervalMins: 5 })
    const r = rows.find(x => x.collection_time === '17:05'); const bad = 'label' in r && /next free|free/.test(String(r.label))
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V4 operator detail on the customer surface: 17:05 row carries ${JSON.stringify(r.label)}`); if (!bad) process.exit(1) }
  // V5 — a closed-left overlap: a batch ending exactly as the window begins is counted.
  { const X = engine(variantRoot('v5', [['lib/slot-availability.ts', "if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t < iv.endMins) c += iv.items }", "if (iv.endMins > iv.startMins) { if (iv.startMins <= t && t <= iv.endMins) c += iv.items }"]]), 'dotV5')
    const L = lines(X, DOMINIC, DOMINIC_UNITS); const bad = L['17:15'] !== EXPECT['17:15']
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V5 touching windows counted: "${L['17:15']}" (the 16:45–17:00 batch ends as 17:15's window begins)`); if (!bad) process.exit(1) }

  // ── THE FIT SUFFIX'S OWN THREE (19 September 2026) ─────────────────────────────────────────────
  // V6 — the suffix rendered on a RED dot. Patched in the formatter and rendered through the REAL panel,
  // because "shown on red" is a property of what reaches the screen, not of a string.
  { const Panel6 = buildPanel(variantRoot('v6', [['lib/slot-display.ts',
      "  if (!doesNotFit || tone === 'red') return ''", "  if (!doesNotFit) return ''"]]), 'dotV6')
    const P = panelLines(Panel6, engine(REPO, 'dotV6e'), DOMINIC_UNITS, 9, true)
    const bad = /🔴/.test(P['17:05'] || '') && /Not enough time/.test(P['17:05'] || '')
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V6 the suffix on a red dot: "${P['17:05']}"`); if (!bad) process.exit(1) }
  // V7 — the OLD verdict wording restored ("Won't fit"). The panel spells nothing, so this is the formatter.
  { const V = compile(variantRoot('v7', [['lib/slot-display.ts',
      "  return hasLabel ? ' · Not enough time' : ' Not enough time'", "  return hasLabel ? ' · Won\\u2019t fit' : ' Won\\u2019t fit'"]]), ['lib/slot-display.ts'], 'dotV7')
    const out = V.req('lib/slot-display.js').formatFitSuffix('amber', true, true)
    const bad = /Won\u2019t fit/.test(out)
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V7 the long wording restored: ${JSON.stringify(out)}`); if (!bad) process.exit(1) }
  // V8 — the POPUP's title shortened to match the label. It must not be: the popup is the one place the
  // operator reads WHY, and its title is the sentence that names the order.
  { const V = compile(variantRoot('v8', [['lib/slot-fit-message.ts',
      "  return { title: `Can\\u2019t be ready by ${slotLabel}`, lines }", "  return { title: `Order won't fit at ${slotLabel}`, lines }"]]), ['lib/slot-fit-message.ts', 'lib/slot-availability.ts'], 'dotV8')
    const M = V.req('lib/slot-fit-message.js'), EV = V.req('lib/slot-availability.js')
    const back = EV.projectBackwardOccupancy({ '17:00': { pizza: 5 } }, PIZZA15, 17 * 60, null, 5, [], true)
    const fit = EV.fitOrderBackward(back, mins('17:05'), { pizza: 9 }, PIZZA15, null, 17 * 60, 5, NEG, {}, true)
    const title = M.buildFitMessage({ slotLabel: '17:05', why: fit.why, catLabel: c => c }).title
    const bad = title !== 'Can\u2019t be ready by 17:05' 
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V8 the popup title shortened: "${title}"`); if (!bad) process.exit(1) }

  const X = engine(REPO, 'dotReal')
  const Panel = buildPanel(REPO, 'dotPanel')

  console.log("\n── DOMINIC'S CASE — the exact four lines ─────────────────────────────────────────────────")
  for (const on of [false, true]) {
    const L = lines(X, DOMINIC, DOMINIC_UNITS, [], on)
    for (const t of Object.keys(EXPECT)) check(L[t] === EXPECT[t], `switch ${on ? 'ON ' : 'OFF'} · empty order · "${L[t]}"`)
    const P2 = panelLines(Panel, X, DOMINIC_UNITS, 2, on)
    check(P2['17:00'] === '17:00 🔴 8 Pizzas' && P2['17:05'] === '17:05 🔴 9 Pizzas' && P2['17:10'] === '17:10 🔴 9 Pizzas' && P2['17:15'] === '17:15 🟡 1 Pizza',
      `switch ${on ? 'ON ' : 'OFF'} · 2 pizzas · red times carry no verdict: "${P2['17:00']}" / "${P2['17:05']}" / "${P2['17:15']}"`)
    // 9 pizzas: the red times still carry none; an AMBER time that refuses the order says so; a GREEN
    // time that refuses it says so with no separator at all; a green time that takes it says nothing.
    const P9d = panelLines(Panel, X, DOMINIC_UNITS, 9, on)
    check(P9d['17:00'] === '17:00 🔴 8 Pizzas' && P9d['17:05'] === '17:05 🔴 9 Pizzas' && P9d['17:10'] === '17:10 🔴 9 Pizzas',
      `switch ${on ? 'ON ' : 'OFF'} · 9 pizzas · red: "${P9d['17:00']}" / "${P9d['17:05']}" / "${P9d['17:10']}"`)
    check(P9d['17:15'] === '17:15 🟡 1 Pizza · Not enough time' && P9d['17:20'] === '17:20 🟡 1 Pizza · Not enough time',
      `switch ${on ? 'ON ' : 'OFF'} · 9 pizzas · amber, both showing the SAME batch's count: "${P9d['17:15']}" / "${P9d['17:20']}"`)
    // 🔴 THE TWO SWITCH STATES GENUINELY DIFFER AT 17:30, AND BOTH LABELS ARE RIGHT. ON, Dominic's rule
    // fills nearest-first — 8 into the empty [17:15,17:30) and 1 into [17:00,17:15)'s 7 free — so 9 fit
    // and the green dot says nothing. OFF, today's split puts the FULL batch of 8 into the earlier
    // window, which already holds 1, so 9 are refused and the green dot carries the verdict with no
    // separator. That second shape is the green-no-dash case this change specifies.
    check(P9d['17:30'] === (on ? '17:30 🟢' : '17:30 🟢 Not enough time'),
      `switch ${on ? 'ON ' : 'OFF'} · 9 pizzas · 17:30 is green and ${on ? 'FITS ⇒ no label' : 'does NOT fit ⇒ the verdict alone, no dash'}: "${P9d['17:30']}"`)
    check(P9d['17:45'] === '17:45 🟢',
      `switch ${on ? 'ON ' : 'OFF'} · 9 pizzas · a green time that FITS under BOTH carries nothing: "${P9d['17:45']}"`)
  }

  console.log("\n── DOMINIC'S SECOND CASE — 16 pizzas @20:55, 5-minute grid ───────────────────────────────")
  for (const on of [false, true]) {
    const O = lines(X, C2, C2_UNITS, C2_OVERRIDE, on)          // the pre-fix override record: all 16 in ONE window
    check(O['20:55'] === '20:55 🔴 16 Pizzas' && O['21:00'] === '21:00 🔴 16 Pizzas' && O['21:05'] === '21:05 🔴 16 Pizzas' && O['21:10'] === '21:10 🟢',
      `switch ${on ? 'ON ' : 'OFF'} · the record Dominic's order carries (16 in one window): 20:55 "${O['20:55']}" · 21:00 "${O['21:00']}" · 21:05 "${O['21:05']}" · 21:10 "${O['21:10']}"`)
    // 🔴 AND THE ONE TIME HIS LIST NAMES THAT THE ENGINE DOES NOT PRODUCE. Cooking for a 20:55 collection
    // cannot begin before 20:25, so the window ending at 20:40 is [20:25,20:40): with all 16 in
    // 20:40–20:55 it is EMPTY (green); with the fixed two-windows-of-8 record it holds this order's own
    // first batch and reads "8 Pizzas". "20:40 🔴 Full" is reachable in neither. Reported, not asserted.
    check(O['20:40'] === '20:40 🟢', `…20:40 with that record: "${O['20:40']}" (his list says 🔴 "Full" — see the report)`)
    const F = lines(X, C2, C2_UNITS, C2_FIT, on)               // the shape the fixed admission stores
    check(F['20:30'] === '20:30 🔴 8 Pizzas' && F['20:40'] === '20:40 🔴 8 Pizzas' && F['20:55'] === '20:55 🔴 8 Pizzas' && F['21:00'] === '21:00 🔴 8 Pizzas' && F['21:10'] === '21:10 🟢',
      `switch ${on ? 'ON ' : 'OFF'} · the fixed record (two windows of 8): 20:30 "${F['20:30']}" · 20:40 "${F['20:40']}" · 20:55 "${F['20:55']}" · 21:00 "${F['21:00']}"`)
  }

  console.log('\n── NO DOT LABEL NAMES A TIME; THE POPUP AND THE TRAILING LABEL ARE UNTOUCHED ─────────────')
  { // every label this harness can produce, over every fixture above, switch ON and OFF
    const every = []
    for (const on of [false, true]) {
      for (const [cx, u, r] of [[DOMINIC, DOMINIC_UNITS, []], [DOMINIC, { '17:00': { pizza: 5 } }, []], [C2, C2_UNITS, C2_FIT], [C2, C2_UNITS, C2_OVERRIDE], [{ ...DOMINIC, iv: 10 }, { '17:00': { pizza: 8 }, '17:30': { pizza: 8 } }, []]])
        every.push(...Object.values(lines(X, cx, u, r, on)))
      every.push(...Object.values(panelLines(Panel, X, DOMINIC_UNITS, 9, on)))
    }
    const named = every.filter(l => /next free|\d\d:\d\d.*\d\d:\d\d/.test(l.replace(/^\d\d:\d\d /, '')))
    check(named.length === 0, `${every.length} rendered lines across every fixture, both switch states: ${named.length} name another time${named.length ? ' — ' + JSON.stringify(named.slice(0, 3)) : ''}`)
    const disp = fs.readFileSync(path.join(REPO, 'lib/slot-display.ts'), 'utf8')
    const fmt = disp.slice(disp.indexOf('export function formatOverlapLabel'), disp.indexOf('interface SlotInput'))
    check(!/next free/.test(fmt) && !/nextFree/.test(disp.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')), 'lib/slot-display.ts: the formatter and the module carry no nextFree code (comments aside)')
    check(!/nextFitAfter/.test(fs.readFileSync(path.join(REPO, 'components/dashboard/AddOrderPanel.tsx'), 'utf8').replace(/\/\/[^\n]*/g, '')), 'AddOrderPanel: the panel\'s own next-free memo is gone (it re-formatted the label)')
  }
  { // THE POPUP — a different surface, its own wording, unchanged by this work.
    const M = require(path.join(compile(REPO, ['lib/slot-fit-message.ts'], 'fitmsg').out, 'lib/slot-fit-message.js'))
    const back = X.E.projectBackwardOccupancy({ '17:00': { pizza: 5 } }, PIZZA15, 17 * 60, null, 5, [], true)
    const fit = X.E.fitOrderBackward(back, mins('17:05'), { pizza: 9 }, PIZZA15, null, 17 * 60, 5, NEG, {}, true)
    const msg = M.buildFitMessage({ slotLabel: '17:05', why: fit.why, catLabel: c => c.charAt(0).toUpperCase() + c.slice(1) })
    check(msg.title === 'Can\u2019t be ready by 17:05', `popup title: "${msg.title}"`)
    check(msg.lines.some(l => /\d+ free/.test(l)), `…and it still names each window's free room: ${JSON.stringify(msg.lines.filter(l => /free|Full/.test(l)))}`)
    check(fs.readFileSync(path.join(REPO, 'lib/slot-fit-message.ts'), 'utf8').split('next free').length === 1, 'lib/slot-fit-message.ts contains no "next free" — it never did, and none was added')
  }
  { // THE FIT SUFFIX — "Not enough time", green and amber only, its two separator forms.
    const panel = fs.readFileSync(path.join(REPO, 'components/dashboard/AddOrderPanel.tsx'), 'utf8')
    check(/\{formatFitSuffix\(ind\.tone, wontFit, !!label\)\}/.test(panel), 'the option calls the ONE shared formatter with the dot\'s tone')
    check(!/Order won/.test(panel.replace(/\/\/[^\n]*/g, '')), 'the panel spells no fit wording of its own (comments aside)')
    // A GREEN time that does not fit: an empty board and 9 pizzas early in the event (the pre-open lead
    // refuses them), so the dot has no label of its own and the suffix stands alone with no dash.
    const Pg = panelLines(Panel, X, {}, 9, true)
    check(Pg['17:05'] === '17:05 🟢 Not enough time', `a green time that refuses the order: "${Pg['17:05']}" — no dash, no other label`)
    check(Pg['18:00'] === '18:00 🟢', `…and a green time that takes it says nothing: "${Pg['18:00']}"`)
    // Across every rendered line of every fixture: no red dot carries the suffix, and the long form is gone.
    const all = []
    for (const on of [false, true]) for (const [u, n] of [[DOMINIC_UNITS, 9], [DOMINIC_UNITS, 2], [DOMINIC_UNITS, 0], [{}, 9], [C2_UNITS, 9]])
      all.push(...Object.values(panelLines(Panel, X, u, n, on)))
    const redWithSuffix = all.filter(l => /🔴/.test(l) && /Not enough time/.test(l))
    check(redWithSuffix.length === 0, `${all.length} rendered options across five baskets, both switch states: ${redWithSuffix.length} red dot(s) carry the verdict${redWithSuffix.length ? ' — ' + JSON.stringify(redWithSuffix.slice(0, 3)) : ''}`)
    check(all.every(l => !/Won\u2019t fit|Order won/.test(l)), 'no rendered operator label carries the retired "Won\'t fit" wording')
    check(all.every(l => !/\bpeak\b/.test(l)), `no rendered label contains the word "peak" (${all.length} lines)`)
    check(all.every(l => !/– *Not enough time/.test(l)), 'no rendered label puts an en dash before the verdict')
    const empties = Object.values(panelLines(Panel, X, DOMINIC_UNITS, 0, true))
    check(empties.every(l => !/Not enough time/.test(l)), `an EMPTY order produces no fit label anywhere (${empties.length} options)`)
  }

  console.log("\n── DOMINIC'S BOARD — a red dot's number is the window's total, never one batch ───────────")
  for (const on of [false, true]) {
    for (const n of [0, 2]) {
      const P = panelLines(Panel, X, BOARD_UNITS, n, on, BOARD.end)
      check(BOARD_TIMES.every(t => P[t] === `${t} ${BOARD_EXPECT[t]}`),
        `switch ${on ? 'ON ' : 'OFF'} · ${n} in the basket · ${BOARD_TIMES.map(t => `"${P[t]}"`).join(' ')}`)
      const reds = BOARD_TIMES.filter(t => /🔴/.test(P[t]))
      check(reds.every(t => Number(P[t].match(/🔴 (\d+)/)[1]) >= 8), `…every red time (${reds.join(', ')}) carries at least the batch of 8`)
    }
    const P3 = panelLines(Panel, X, BOARD_UNITS, 3, on, BOARD.end)
    check(P3['22:10'] === '22:10 🟡 6 Pizzas · Not enough time' && P3['22:15'] === '22:15 🟡 5 Pizzas',
      `switch ${on ? 'ON ' : 'OFF'} · 3 in the basket · 22:10 shows its window's TOTAL and refuses (6 + 3 > 8): "${P3['22:10']}"; 22:15 takes it: "${P3['22:15']}"`)
  }

  console.log('\n── THE SPAN TOTAL: what comes out of the stretch each dot covers ─────────────────────────')
  { const L = lines(X, TEN_ON_FIVE, TEN_ON_FIVE_UNITS)
    check(L['10:40'] === '10:40 🔴 4 Pizzas', `10-minute times on a 5-minute cook, batch 2, two full batches inside one dot: "${L['10:40']}"`)
    const P = panelLines(Panel, X, TEN_ON_FIVE_UNITS, 1, true, TEN_ON_FIVE.end, TEN_ON_FIVE)
    check(/4 Pizzas/.test(P['10:40'] || ''), `…and the Add Order row reads the same: "${P['10:40']}"`) }
  { const L = lines(X, THIRTY_ON_FIFTEEN, THIRTY_ON_FIFTEEN_UNITS)
    check(L['18:00'] === '18:00 🟡 9 Pizzas' && L['18:30'] === '18:30 🟡 12 Pizzas',
      `30-minute times on a 15-minute cook: "${L['18:00']}" and "${L['18:30']}" — two cooking windows each, totalled`) }
  { const L = lines(X, C3, { '21:45': { pizza: 8 } })
    check(['21:45', '21:50', '21:55'].every(t => L[t] === `${t} 🔴 8 Pizzas`),
      `15-minute cook on 5-minute times: the SAME batch of 8 is named on each time it covers, counted once — "${L['21:45']}" "${L['21:50']}" "${L['21:55']}" (never 16)`) }
  { // the total may exceed the batch with nothing overbooked: the colour is the peak, and the order still fits
    const L = lines(X, OVER_TOTAL, OVER_TOTAL_UNITS)
    check(L['10:45'] === '10:45 🟡 6 Pizzas', `three back-to-back batches of 2 on a batch of 4: total 6, peak 2 ⇒ still AMBER — "${L['10:45']}"`)
    const P = panelRaw(Panel, X, OVER_TOTAL_UNITS, 1, true, OVER_TOTAL.end, OVER_TOTAL)
    check(!MARK_RE.test(P['10:45'] || '') || !/\u00d7/.test(P['10:45'] || ''), `…and the row carries NO cross, because the order fits: ${JSON.stringify(P['10:45'])}`) }

  console.log('\n── THE CROSS: a row is marked if and only if THIS order cannot be ready by then ──────────')
  for (const on of [false, true]) {
    const P = panelRaw(Panel, X, BOARD_UNITS, 3, on, BOARD.end)
    const crossed = BOARD_TIMES.filter(t => /^\u00d7 /.test(P[t] || ''))
    const marked = BOARD_TIMES.filter(t => /^\u2007 /.test(P[t] || ''))
    check(crossed.length + marked.length === BOARD_TIMES.length,
      `switch ${on ? 'ON ' : 'OFF'} · every one of the ${BOARD_TIMES.length} rows carries a marker of the same width: ${crossed.length} crossed, ${marked.length} blank`)
    check(crossed.every(t => /🔴|🟡|🟢/.test(P[t])), `switch ${on ? 'ON ' : 'OFF'} · a crossed row keeps its dot and its count: ${JSON.stringify(P[crossed[0]] || null)}`)
    // red + crossed ⇒ the count stands alone, no verdict text
    const redCrossed = crossed.filter(t => /🔴/.test(P[t]))
    check(redCrossed.length > 0 && redCrossed.every(t => !/Not enough time/.test(P[t])),
      `switch ${on ? 'ON ' : 'OFF'} · ${redCrossed.length} red crossed row(s), none carrying the verdict text: ${JSON.stringify(P[redCrossed[0]])}`)
    // green/amber + crossed ⇒ the verdict explains a kitchen that looks free
    const softCrossed = crossed.filter(t => /🟡|🟢/.test(P[t]))
    check(softCrossed.every(t => /Not enough time/.test(P[t])),
      `switch ${on ? 'ON ' : 'OFF'} · ${softCrossed.length} green/amber crossed row(s), every one explained: ${JSON.stringify(P[softCrossed[0]] || null)}`)
    check(marked.every(t => !/Not enough time/.test(P[t])), `switch ${on ? 'ON ' : 'OFF'} · no uncrossed row carries the verdict`)
  }
  { // AN EMPTY ORDER: no cross, no marker, no verdict — the list is exactly as it is today
    const P = panelRaw(Panel, X, BOARD_UNITS, 0, true, BOARD.end)
    const all = BOARD_TIMES.map(t => P[t] || '')
    check(all.every(l => !/\u00d7/.test(l)), 'an EMPTY order: no row carries a cross')
    check(all.every(l => !MARK_RE.test(l)), '…and none carries the blank marker either — every row starts at its time')
    check(all.every(l => !/Not enough time/.test(l)), '…and none carries the verdict text') }
  { // NEVER `disabled`: a refused row stays selectable, so tapping it still raises the popup
    const html = panelHtml(Panel, X, BOARD_UNITS, 3, true, BOARD.end)
    const sel = html.slice(html.indexOf('<select'), html.indexOf('</select>'))
    check(!/<option[^>]*\bdisabled\b/.test(sel), 'no <option> in the time list is disabled — a crossed row is still selectable')
    check(/\u00d7/.test(sel), '…and the crosses really are in the rendered markup') }
  { // CROSS AGREEMENT over seeded states: crossed ⇔ fitOrderBackward refuses this order at this time
    let seed = 20260919; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }; const pick = a => a[Math.floor(rnd() * a.length)]
    let rows = 0, disagree = 0; const ex = []
    for (let i = 0; i < 120; i++) {
      const prep = pick([5, 10, 15]), batch = pick([2, 4, 8]), kc = pick([null, null, 6]), iv = pick([5, 10, 15]), on = i % 2 === 1
      const cfg = { pizza: { secs: prep * 60, batch } }
      const cx = { cfg, start: 17 * 60, end: 19 * 60, iv, kc }
      const times = grid(X, cx.start, cx.end, iv)
      const units = {}; for (let k = 0; k < 5; k++) { const t = pick(times).collection_time; units[t] = { pizza: (units[t]?.pizza || 0) + 1 + Math.floor(rnd() * batch) } }
      const n = 1 + Math.floor(rnd() * 3)
      const P = panelRaw(Panel, X, units, n, on, cx.end, cx)
      const back = X.E.projectBackwardOccupancy(units, cfg, cx.start, kc, 5, [], on)
      for (const t of times) { const line = P[t.collection_time]; if (line == null) continue
        rows++
        const fit = X.E.fitOrderBackward(back, toMins(t.collection_time), { pizza: n }, cfg, kc, cx.start, 5, Number.NEGATIVE_INFINITY, units[t.collection_time] || {}, on)
        const crossed = /^\u00d7 /.test(line)
        if (crossed !== !fit.fits) { disagree++; if (ex.length < 3) ex.push(`prep ${prep} b${batch} kc${kc} iv${iv} ${t.collection_time} crossed=${crossed} fits=${fit.fits} "${line}"`) } }
    }
    check(rows >= 2000, `${rows} rendered rows across 120 seeded states (preps 5/10/15, batches 2/4/8, grids 5/10/15, kc null/6, switch ON and OFF)`)
    check(disagree === 0, `CROSS AGREEMENT: a row is crossed if and only if fitOrderBackward refuses that order at that time — ${disagree} disagree${ex.length ? ' — ' + ex.join('; ') : ''}`)
  }

  console.log('\n── THE INVARIANT: on a red dot the number ≥ the binding limit (batch or ceiling) ─────────────')
  { let seed = 20260919; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }; const pick = a => a[Math.floor(rnd() * a.length)]
    for (const iv of [5, 10]) {
      const times = grid(X, 17 * 60, 21 * 60, iv)
      let states = 0, reds = 0, broken = 0, ambers = 0, blank = 0, ceilingReds = 0, ceilingBelow = 0; const ex = []; const cex = []
      for (let i = 0; i < (iv === 5 ? 400 : 200); i++) {
        const prep = pick([10, 15]), batch = pick([2, 8]), kc = pick([null, null, 6]), on = i % 2 === 1
        const cfg = { pizza: { secs: prep * 60, batch } }; const units = {}; const nO = 3 + Math.floor(rnd() * 6)
        for (let k = 0; k < nO; k++) { const t = pick(times).collection_time; units[t] = { pizza: (units[t]?.pizza || 0) + 1 + Math.floor(rnd() * batch) } }
        const ind = X.D.buildSlotIndicators(times, units, cfg, kc, 17 * 60, ['pizza'], 5, iv, [], on); states++
        const back = X.E.projectBackwardOccupancy(units, cfg, 17 * 60, kc, 5, [], on); const step = X.E.backwardWindowStepMins(cfg)
        for (let ti = 0; ti < times.length; ti++) { const t = times[ti]; const d = ind.get(t.collection_time); if (!d) continue
          const num = (d.label.match(/(\d+) /g) || []).reduce((a, m) => a + Number(m), 0)
          if (d.tone === 'red') { reds++
            const T = toMins(t.collection_time); const read = X.E.dotOccupancyAt(back, T, ti > 0 ? toMins(times[ti - 1].collection_time) : null, step, 17 * 60, cfg, kc, iv, on)
            // red by the ceiling: the rolling read's kitchen reason, a window bound by the global ceiling, or the
            // event-start pile whose piled TOTAL reaches the cap (its bound_by is §31's own wording)
            // …or the event-start pile made red by a pre-open window over the ceiling (§31 propagates that red;
            // the pile's own count can then be under the batch, which is the ceiling's doing, not the batch's)
            const isPile = !!(read.window && back.pileByStart.has(T) && !read.overlap)
            const byCeiling = read.overlap ? read.overlap.kind === 'kitchen' : !!(read.window && (read.window.bound_by === 'global ceiling' || (kc != null && (read.window.total >= kc - 1e-9 || (isPile && num < batch)))))
            if (byCeiling) { ceilingReds++; if (kc != null && num < kc) { ceilingBelow++; if (cex.length < 2) cex.push(`prep ${prep} b${batch} kc${kc} ${t.collection_time} "${d.label}"`) } }
            else if (num < batch) { broken++; if (ex.length < 3) ex.push(`prep ${prep} b${batch} kc${kc} ${t.collection_time} "${d.label}"`) } }
          if (d.tone === 'amber') { ambers++; if (num === 0) blank++ } }
      }
      check(broken === 0, `${iv}-minute grid · ${states} states (preps 10/15, batches 2/8, kc null/6, ON/OFF) · ${reds} red dots, ${reds - ceilingReds} red by the batch: ${broken} labelled below the batch${ex.length ? ' — ' + ex.join('; ') : ''}`)
      console.log(`  ℹ ${ceilingReds} red by the KITCHEN CEILING: ${ceilingBelow} carry a category count below the cap${cex.length ? ' (e.g. ' + cex.join('; ') + ')' : ''} — the event-start pile made red by a pre-open window over the ceiling shows its own piled count (§31), and a multi-category window lists each category's peak (18 September 2026; docs/peak-ceiling-rule-report.md)`)
      check(blank === 0, `…and ${ambers} amber dots all carry their window's number (${blank} blank)`)
    }
  }

  console.log('\n── THE §4 TABLE: 8 pizzas @21:45, 5 @22:10, prep 15, batch 8, 5-minute grid ──────────────')
  for (const on of [false, true]) {
    const P3 = panelLines(Panel, X, C3_UNITS, 3, on, C3.end)
    check(['21:40', '21:45', '21:50', '21:55'].every(t => P3[t] === `${t} 🔴 8 Pizzas`),
      `switch ${on ? 'ON ' : 'OFF'} · 3 pizzas · the 21:30–21:45 batch reads "8 Pizzas" on all four times it covers: ${['21:40', '21:45', '21:50', '21:55'].map(t => `"${P3[t]}"`).join(' ')}`)
    check(['22:00', '22:05', '22:10', '22:15', '22:20'].every(t => P3[t] === `${t} 🟡 5 Pizzas`),
      `switch ${on ? 'ON ' : 'OFF'} · 3 pizzas · the 21:55–22:10 batch reads "5 Pizzas" on all five, no verdict (3 fit): ${['22:00', '22:10', '22:20'].map(t => `"${P3[t]}"`).join(' ')}`)
    check(P3['22:25'] === '22:25 🟢', `switch ${on ? 'ON ' : 'OFF'} · 3 pizzas · 22:25 is clear: "${P3['22:25']}"`)
    // 4 pizzas: 5 + 4 = 9 over the batch of 8, so every amber line gains the verdict; red is still silent.
    const P4 = panelLines(Panel, X, C3_UNITS, 4, on, C3.end)
    check(['22:00', '22:05', '22:10', '22:15', '22:20'].every(t => P4[t] === `${t} 🟡 5 Pizzas · Not enough time`),
      `switch ${on ? 'ON ' : 'OFF'} · 4 pizzas · each amber line gains the verdict: "${P4['22:10']}"`)
    check(['21:40', '21:45', '21:50', '21:55'].every(t => P4[t] === `${t} 🔴 8 Pizzas`),
      `switch ${on ? 'ON ' : 'OFF'} · 4 pizzas · red lines still carry none: "${P4['21:50']}"`)
    // A third order of 1 collected 22:05 shares the 21:50–22:05 window, so times covering BOTH read the sum.
    const P6 = panelLines(Panel, X, { ...C3_UNITS, '22:05': { pizza: 1 } }, 3, on, C3.end)
    check(P6['22:00'] === '22:00 🟡 6 Pizzas · Not enough time' && P6['22:15'] === '22:15 🟡 6 Pizzas · Not enough time',
      `switch ${on ? 'ON ' : 'OFF'} · a 1-pizza order at 22:05 makes 22:00 and 22:15 read the SUM: "${P6['22:00']}" / "${P6['22:15']}"`)
    check(P6['21:55'] === '21:55 🔴 9 Pizzas', `…and 21:55, whose stretch covers both the 8 (to 21:45) and the 1 (from 21:50), reads the TOTAL 9 — the peak across it is 8: "${P6['21:55']}"`)
    const empty = panelLines(Panel, X, C3_UNITS, 0, on, C3.end)
    check(C3_TIMES.every(t => !/Not enough time/.test(empty[t])), `switch ${on ? 'ON ' : 'OFF'} · an EMPTY order shows no verdict on any of the ten times`)
  }

  console.log('\n── NOTHING SAYS "Full" OR "free"; ownLabel IS UNTOUCHED ──────────────────────────────────')
  { const every = []
    for (const on of [false, true]) {
      for (const [cx, u, r] of [[DOMINIC, DOMINIC_UNITS, []], [DOMINIC, { '17:00': { pizza: 5 } }, []], [C2, C2_UNITS, C2_FIT], [C2, C2_UNITS, C2_OVERRIDE], [C3, C3_UNITS, []], [{ ...DOMINIC, iv: 10 }, { '17:00': { pizza: 8 }, '17:30': { pizza: 8 } }, []]])
        every.push(...Object.values(lines(X, cx, u, r, on)))
      for (const n of [0, 3, 4, 9]) every.push(...Object.values(panelLines(Panel, X, C3_UNITS, n, on, C3.end)))
    }
    const banned = every.filter(l => /\bFull\b|\bfree\b/.test(l))
    check(banned.length === 0, `${every.length} rendered lines: ${banned.length} contain "Full" or "free"${banned.length ? ' — ' + JSON.stringify(banned.slice(0, 3)) : ''}`)
    const disp = fs.readFileSync(path.join(REPO, 'lib/slot-display.ts'), 'utf8')
    const code = disp.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    check(!/formatOverlapLabel/.test(code), 'formatOverlapLabel is gone from the module\'s code (the comment that records what it replaced stays)')
    check(!/'Full'|Kitchen full|\} free/.test(code), '…and none of its six strings survives in the module\'s code (comments aside)')
  }
  { // §31's EVENT-START PILE — ownLabel, so untouched: the raw piled count, not the run-up window.
    const L = lines(X, { cfg: { pizza: { secs: 300, batch: 4 } }, start: 16 * 60 + 30, end: 17 * 60 + 30, iv: 5, kc: null }, { '16:30': { pizza: 6 } })
    check(L['16:30'] === '16:30 🔴 6 Pizzas', `§31 event-start pile still shows its RAW piled count: "${L['16:30']}" (the manual's worked example)`) }
  { // A TICKED NO-PREP CATEGORY on a time with its own load — ownLabel, so it still appears.
    const cfg = { pizza: { secs: 300, batch: 2 }, drink: { secs: 0, batch: 0, countsToCapacity: true } }
    const L = lines(X, { cfg, start: 17 * 60, end: 18 * 60, iv: 5, kc: 6, order: ['pizza', 'drink'] }, { '17:10': { pizza: 2, drink: 3 } })
    check(L['17:10'] === '17:10 🔴 2 Pizzas, 3 Drinks', `a ticked no-prep category still appears in the label of a time with its own load: "${L['17:10']}"`) }
  { // TWO cooking categories overlapping a time that has no load of its own — both are listed.
    const cfg = { pizza: { secs: 900, batch: 8 }, burgers: { secs: 600, batch: 6 } }
    const L = lines(X, { cfg, start: 17 * 60, end: 18 * 60, iv: 5, kc: null, order: ['pizza', 'burgers'] }, { '17:30': { pizza: 8 }, '17:35': { burgers: 4 } })
    check(L['17:40'] === '17:40 🔴 8 Pizzas, 4 Burgers', `two categories cooking across one overlapped time list BOTH: "${L['17:40']}"`) }

  console.log('\n── PARTIAL, TWO CATEGORIES, KITCHEN, CUSTOMER ───────────────────────────────────────────')
  { const L = lines(X, DOMINIC, { '17:00': { pizza: 5 } })
    check(L['17:00'] === '17:00 🟡 5 Pizzas' && L['17:05'] === '17:05 🟡 5 Pizzas' && L['17:10'] === '17:10 🟡 5 Pizzas' && L['17:15'] === '17:15 🟢',
      `part-full batch: 5 @17:00 reads its COUNT on every time it covers — "${L['17:00']}" "${L['17:05']}" "${L['17:10']}" then "${L['17:15']}"`) }
  { const cfg = { pizza: { secs: 900, batch: 8 }, burgers: { secs: 600, batch: 6 } }
    const L = lines(X, { ...DOMINIC, cfg, order: ['pizza', 'burgers'] }, { '17:00': { pizza: 8 }, '17:20': { burgers: 4 } })
    check(L['17:05'] === '17:05 🔴 8 Pizzas', `two categories, the pizza batch alone covers 17:05: "${L['17:05']}"`)
    check(L['17:15'] === '17:15 🟡 4 Burgers', `…and 17:15 is covered by the burger batch alone: "${L['17:15']}"`) }
  { const cfg = { pizza: { secs: 900, batch: 8 }, burgers: { secs: 600, batch: 6 } }
    const L = lines(X, { ...DOMINIC, cfg, kc: 6, order: ['pizza', 'burgers'] }, { '17:00': { pizza: 4, burgers: 2 } })
    check(L['17:05'] === '17:05 🔴 4 Pizzas, 2 Burgers', `kitchen ceiling binding — the label is the window's ITEM COUNTS, no "Kitchen" wording: "${L['17:05']}"`)
    const Lp = lines(X, { ...DOMINIC, cfg, kc: 6, order: ['pizza', 'burgers'] }, { '17:00': { pizza: 3, burgers: 2 } })
    check(Lp['17:05'] === '17:05 🟡 3 Pizzas, 2 Burgers', `kitchen partial, same rule: "${Lp['17:05']}"`) }
  { // the customer surface: /api/slots rows carry the tone, no reason text, and `available` is today's.
    const rows = X.E.buildSlotAvailability({ times: grid(X, 17 * 60, 21 * 60, 5), productionSlotUnits: DOMINIC_UNITS, catConfigs: PIZZA15, kitchenCapacity: null, capacityWindowMins: 5, date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: 17 * 60, displayIntervalMins: 5 })
    const r = rows.find(x => x.collection_time === '17:05')
    check(r.tone === 'red' && r.available === true && !('label' in r) && !Object.values(r).some(v => typeof v === 'string' && /next free|free/.test(v)), `customer row 17:05: tone ${r.tone}, available ${r.available} (today's window), no reason text`)
    const page = fs.readFileSync(path.join(REPO, 'app/trucks/[slug]/order/page.tsx'), 'utf8')
    check(!/next free|formatOverlapLabel|overlap\./.test(page), 'the customer page renders no operator reason (no "next free", no formatter)') }
  { // 10–30 grids: the peak coverage still stands, and the rolling read combines with it by max.
    const cx = { ...DOMINIC, iv: 10 }; const L = lines(X, cx, { '17:00': { pizza: 8 }, '17:30': { pizza: 8 } })
    check(L['17:30'] === '17:30 🔴 8 Pizzas' && L['17:10'] === '17:10 🔴 8 Pizzas' && L['17:40'] === '17:40 🔴 8 Pizzas' && L['17:50'] === '17:50 🟢', `10-minute grid, prep 15: "${L['17:10']}" · "${L['17:30']}" · "${L['17:40']}" · "${L['17:50']}"`) }

  console.log('\n── AGREEMENT: dot red by overlap ⇔ a one-item order of that category is refused ────────────')
  { let rng = 20260918; const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296
    let states = 0, compared = 0, mism = 0, first = null, leadOnly = 0, leadOnlyOutside = 0
    for (const prep of [10, 15]) for (let k = 0; k < 1100; k++) {
      const cfg = { pizza: { secs: prep * 60, batch: [4, 6, 8][Math.floor(rand() * 3)] }, ...(rand() < 0.4 ? { sides: { secs: 600, batch: 4 } } : {}) }
      const kc = [null, null, 6, 10][Math.floor(rand() * 4)]; const on = rand() < 0.5
      const start = 17 * 60, end = 19 * 60; const times = grid(X, start, end, 5)
      const units = {}; const n = 1 + Math.floor(rand() * 4)
      for (let i = 0; i < n; i++) { const t = times[Math.floor(rand() * times.length)].collection_time; const cat = Object.keys(cfg)[Math.floor(rand() * Object.keys(cfg).length)]
        units[t] = units[t] || {}; units[t][cat] = (units[t][cat] || 0) + 1 + Math.floor(rand() * (cfg[cat].batch + 2)) }
      states++
      const back = X.E.projectBackwardOccupancy(units, cfg, start, kc, 5, [], on); const step = X.E.backwardWindowStepMins(cfg)
      const ordered = times.map(t => mins(t.collection_time))
      for (const t of times) { const T = mins(t.collection_time); const prev = ordered.indexOf(T) > 0 ? ordered[ordered.indexOf(T) - 1] : null
        const read = X.E.dotOccupancyAt(back, T, prev, step, start, cfg, kc, 5, on)
        for (const cat of Object.keys(cfg)) { compared++
          const dotRed = read.perCat[cat].full
          const fit = X.E.fitOrderBackward(back, T, { [cat]: 1 }, cfg, kc, start, 5, NEG, units[t.collection_time] || {}, on)
          const refused = !fit.fits
          if (dotRed === refused) continue
          // The dot reads LOAD, never lead (§31): a one-item order can also be refused because the slot's
          // committed load plus one needs a cooking window before the pre-open run-up. That refusal has no
          // overlap to show, is possible only inside the first prep window after opening, and is the one
          // shape allowed here — counted, never hidden.
          const kinds = (fit.why || []).map(w => w.kind)
          if (!dotRed && refused && kinds.length && kinds.every(x => x === 'preopen')) {
            // §31's lead rule, restated independently: the slot's committed load plus this one item needs
            // ceil((E+1)/batch) windows ending at T, and the earliest of them would start before the one
            // pre-open run-up (start − prep). Every lead-only refusal must satisfy exactly that.
            const E = (units[t.collection_time] || {})[cat] || 0; const prepM = cfg[cat].secs / 60; const nw = Math.ceil((E + 1) / cfg[cat].batch)
            leadOnly++; if (!(T - nw * prepM < start - prepM)) leadOnlyOutside++; continue }
          mism++; if (!first) first = { prep, on, kc, t: t.collection_time, cat, cfg, dotRed, refused, why: kinds, units } } } }
    check(mism === 0, `${states} states (prep 10 and 15, batch 4/6/8, kc null/6/10, switch ON and OFF), ${compared} (time, category) reads: dot red by overlap ⇔ refused, ${mism} disagree${first ? ' — first ' + JSON.stringify(first).slice(0, 260) : ''}`)
    check(leadOnlyOutside === 0, `…the only refusals with no overlap to show are LEAD refusals (why = preopen only): ${leadOnly}, every one exactly §31's pre-open rule on the slot's committed load + 1 (${leadOnlyOutside} not)`) }

  console.log('\n── ALIGNED IDENTITY: every surface equals today on aligned grids ───────────────────────────')
  { const T = engine(variantRoot('today', [V1, V1b]), 'dotToday')      // the rolling read disabled = today's read, by construction
    let rng = 7; const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296
    let states = 0, diffs = 0, first = null
    // 🔴 ALIGNED MEANS GRID == PREP (19 September 2026). It used to mean "prep DIVIDES the grid", which
    // let a 5-minute cook onto a 30-minute grid — six cooking windows behind one dot. Those dots are
    // COVERS, and a cover now reports its own stretch rather than the fullest window it covers
    // (docs/cover-dot-own-window-report.md), so they change on purpose: that is the fix. Where the grid
    // EQUALS the prep each dot covers exactly one window, cover and window coincide, and nothing moves —
    // which is the identity this sweep exists to hold. Gusto's 5-on-5 and a 15-on-15 truck are both here.
    const PREPS = { 5: [5], 10: [10], 15: [15], 20: [20], 30: [30] }
    for (let k = 0; k < 1200; k++) {
      const iv = [5, 10, 15, 20, 30][k % 5]; const preps = PREPS[iv]
      const cfg = {}; const ncat = 1 + Math.floor(rand() * 2)
      for (let c = 0; c < ncat; c++) cfg['c' + c] = { secs: preps[Math.floor(rand() * preps.length)] * 60, batch: 2 + Math.floor(rand() * 7) }
      if (rand() < 0.3) cfg.instant = { secs: 0, batch: 0, countsToCapacity: true }
      const kc = rand() < 0.5 ? null : 3 + Math.floor(rand() * 8); const on = rand() < 0.5
      const start = 17 * 60, end = start + 120; const times = grid(X, start, end, iv)
      const units = {}; const n = 1 + Math.floor(rand() * 5)
      for (let i = 0; i < n; i++) { const t = times[Math.floor(rand() * times.length)].collection_time; const cat = Object.keys(cfg)[Math.floor(rand() * Object.keys(cfg).length)]; units[t] = units[t] || {}; units[t][cat] = (units[t][cat] || 0) + 1 + Math.floor(rand() * 9) }
      states++
      const a = JSON.stringify([...X.D.buildSlotIndicators(times, units, cfg, kc, start, Object.keys(cfg), 5, iv, [], on)].map(([t, i]) => [t, i.tone, i.label]))
      const b = JSON.stringify([...T.D.buildSlotIndicators(times, units, cfg, kc, start, Object.keys(cfg), 5, iv, [], on)].map(([t, i]) => [t, i.tone, i.label]))
      const p = { times, productionSlotUnits: units, catConfigs: cfg, kitchenCapacity: kc, capacityWindowMins: 5, date: '2099-01-01', nowMins: 0, earliestCollectionMins: 0, eventStartMins: start, displayIntervalMins: iv, batchReservations: on }
      const ra = JSON.stringify(X.E.buildSlotAvailability(p).map(r => [r.collection_time, r.tone, r.available, r.bound_by])), rb = JSON.stringify(T.E.buildSlotAvailability(p).map(r => [r.collection_time, r.tone, r.available, r.bound_by]))
      if (a !== b || ra !== rb) { diffs++; if (!first) first = { iv, cfg, kc, on, units } } }
    check(diffs === 0, `${states} seeded aligned states (grid == prep at 5/10/15/20/30, instants + ceilings, switch ON/OFF): dots and /api/slots tones ${diffs} differ${first ? ' — first ' + JSON.stringify(first).slice(0, 200) : ''}`)
    // The Gusto-shaped and aligned golden families, through the same comparison.
    const golden = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/batch-rolling-golden.json'), 'utf8')); const SN = require('./_batch-rolling-snapshot.cjs')
    let gd = 0, gn = 0
    for (const fam of ['gustoShaped', 'aligned240']) for (let i = 0; i < golden[fam].cases.length; i++) { const cx = SN.decodeCase(fam, golden[fam], golden[fam].cases[i]); const times = golden.grids[SN.gridKey(cx.start, cx.end, cx.iv)]; gn++
      const a = JSON.stringify([...X.D.buildSlotIndicators(times, cx.units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw ?? 5, cx.iv ?? 5)].map(([t, i]) => [t, i.tone, i.label]))
      const b = JSON.stringify([...T.D.buildSlotIndicators(times, cx.units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw ?? 5, cx.iv ?? 5)].map(([t, i]) => [t, i.tone, i.label]))
      if (a !== b) gd++ }
    for (const c of golden.gustoLive.cases) { const cx = c.input; const times = golden.grids[SN.gridKey(cx.start, cx.end, cx.iv)]; gn++
      const a = JSON.stringify([...X.D.buildSlotIndicators(times, cx.units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw ?? 5, cx.iv ?? 5)].map(([t, i]) => [t, i.tone, i.label]))
      const b = JSON.stringify([...T.D.buildSlotIndicators(times, cx.units, cx.cfg, cx.kc, cx.start, Object.keys(cx.cfg), cx.cw ?? 5, cx.iv ?? 5)].map(([t, i]) => [t, i.tone, i.label]))
      if (a !== b) gd++ }
    check(gd === 0, `Gusto-shaped (300) + aligned240 (240) + Gusto's six live events: ${gn} fixtures, ${gd} dots differ from today`) }

  console.log(`\n${fails ? '🔴 ' + fails + ' FAILED' : '✅ overlapped times read full, with a reason, and nothing else moved'}`)
  process.exit(fails ? 1 : 0)
})().catch(e => { console.log('🔴 harness crashed: ' + (e && e.stack || e)); process.exit(1) })
