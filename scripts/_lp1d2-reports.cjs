// scripts/_lp1d2-reports.cjs — Language Phase 1d Part 2, area `reports`: Manage's ReportsTab (app/manage/[token]/page.tsx)
// and THE REPORTS CSVs AS BYTES. A MODULE of scripts/language-phase-1d2.cjs, not a harness.
//
// Views (GB and US — the US truck's orders are USD and carry Phase 3's tax / tip / service-fee snapshot, as get_report
// returns them when `charges` is present):
//   <cc>|tab|<state>      the tab's HTML: the first paint (Pro, Starter, no truck), loading (date / event), the two empty
//                         states, the event picker (with events, none), a date-range report (orders view, items view,
//                         mobile rows expanded, Starter's upsell), an event report (venue · date header; an event with no
//                         venue), one order, an "Other"-only report, a WhatsApp-only report, the van filter (all vans /
//                         a van / a café-named van / unassigned / a deleted van / one van), and the extras lines
//                         (GB: tips under `charges`; US: sales tax, tips, service and card fees, "Food sales").
//   <cc>|csv|<case>       🔴 THE EXACT CSV TEXT the Export CSV button downloads — orders CSV and items CSV for each case.
//   <cc>|csvfiles         every case's download: the filename, the Blob type, the anchor click (and "no download" for
//                         an empty report).
//   <cc>|vanLabel         vanFilterLabel for every filter value, with and without the truck's locale.
//
// 🔴 HOW THE CSV BYTES ARE CAPTURED — the same click path on both codes. Two {file, from, to} patches make the tab's own
// click handlers reachable: `const exportCSV = () => {` → `const exportCSV = (globalThis.__rptH ||= {}).exportCSV = () => {`
// (and the same for exportItemsCSV) — the closures of the rendered state, exactly what the ⬇ buttons' onClick calls
// (`itemView === 'orders' ? exportCSV : exportItemsCSV`). The view renders the state, then calls the handler with
// `Blob`, `URL.createObjectURL` / `revokeObjectURL` and `document.createElement` stubbed: the Blob's parts ARE the
// bytes (`parts.join('')`), and the anchor's `download` + `click()` prove the file was handed to the browser.
const M_FILE = 'app/manage/[token]/page.tsx'

// ── fixtures: what get_report returns (app/api/manage/route.ts, action get_report) ─────────────────────────────
const EVENTS = {
  'ev-a': { id: 'ev-a', event_date: '2026-10-03', venue_name: 'The Green', town: 'Harnessville', van_id: 'v1', status: 'closed' },
  'ev-b': { id: 'ev-b', event_date: '2026-10-05', venue_name: 'Market Square', town: 'Newmarket', van_id: 'v2', status: 'confirmed' },
  'ev-c': { id: 'ev-c', event_date: '2026-10-08', venue_name: 'Village Hall', town: null, van_id: null, status: 'closed' },
  'ev-d': { id: 'ev-d', event_date: '2026-09-20', venue_name: null, town: 'Harnessville', van_id: 'v1', status: 'closed' },
}
// A venue is STORED data — the US truck stands at US-named venues (so the US-words check reads only our words).
const venueOf = (id, cc) => (cc === "US" && EVENTS[id].venue_name === "Village Hall" ? "Community Center" : EVENTS[id].venue_name)
const recentOf = cc => ["ev-c", "ev-b", "ev-a", "ev-d"].map(id => ({ id, venue_name: venueOf(id, cc), event_date: EVENTS[id].event_date, status: EVENTS[id].status }))
const VANS = [{ id: 'v1', name: 'Van 1' }, { id: 'v2', name: 'Big Red Café' }]
const CATEGORIES = { Margherita: 'Pizzas', Pepperoni: 'Pizzas', 'Vegan Special': 'Pizzas', 'Garlic bread': 'Sides', Chips: 'Sides', Coke: 'Drinks', Fanta: 'Drinks' }
const CATEGORY_ORDER = ['Pizzas', 'Sides', 'Drinks']
const LUNCH_DEAL = { name: 'Lunch deal', price: 12, slots: { Pizza: 'Pepperoni', Drink: 'Fanta' } }

const margherita = q => ({ name: 'Margherita', quantity: q, unit_price: 10.75, modifiers: [{ name: 'Extra cheese', price: 1.25 }] })
// `at`: the truck's wall clock when the order was placed (see placedAt).
const RAW = [
  { key: 1, id: '1', ev: 'ev-a', at: '2026-10-03T17:45:00Z', name: 'Sam Harness', email: 'sam@example.test', slot: '18:30', status: 'collected',
    items: [margherita(2), { name: 'Garlic bread', quantity: 1, unit_price: 4, modifiers: [] }, { name: 'Coke', quantity: 3, unit_price: 1.8, modifiers: [], specialInstructions: 'No ice' }],
    deals: [], total: 30.9, tip: 300 },
  { key: 2, id: '2', ev: 'ev-a', at: '2026-10-03T18:10:00Z', name: 'Walk-up', email: null, slot: null, status: 'collected',
    items: [{ name: 'Pepperoni', quantity: 1, unit_price: 0.75, modifiers: [{ name: 'Jalapeños', price: 0.75 }] }, { name: 'Fanta', quantity: 1, unit_price: 0, modifiers: [] }, { name: 'Chips', quantity: 1, unit_price: 3.5, modifiers: [] }],
    deals: [LUNCH_DEAL], total: 16.25 },
  { key: 3, id: '1', ev: 'ev-b', at: '2026-10-05T12:05:00Z', name: 'Jo "JJ" O\'Neill, Esq.', email: 'jo@example.test', slot: '12:30', status: 'confirmed',
    items: [{ name: 'Vegan Special', quantity: 1, unit_price: 13.5, modifiers: [{ name: 'Vegan cheese', price: 1 }, { name: 'No olives', price: 0 }], specialInstructions: 'Cut into 8, please' }],
    deals: [], total: 13.5, card: 45 },
  { key: 4, id: '2', ev: 'ev-b', at: '2026-10-05T13:40:00Z', name: null, email: null, slot: '13:45', status: 'ready',
    items: [{ name: 'Mystery Box', quantity: 1, unit_price: 5, modifiers: [] }], deals: [], total: 5 },
  { key: 5, id: '1', ev: 'ev-c', at: '2026-10-08T19:02:00Z', name: 'Priya Patel', email: 'priya@example.test', slot: '19:15', status: 'collected',
    items: [margherita(1), { name: 'Coke', quantity: 2, unit_price: 1.8, modifiers: [], specialInstructions: 'No ice' }, { name: 'Pepperoni', quantity: 1, unit_price: 0, modifiers: [] }, { name: 'Fanta', quantity: 1, unit_price: 0, modifiers: [] }],
    deals: [LUNCH_DEAL], total: 26.35, tip: 150 },
  // No event_id: labelled through the date fallback (eventsByDate) — "Village Hall".
  { key: 6, id: '7', ev: null, date: '2026-10-08', at: '2026-10-08T20:30:00Z', name: 'Walk-up', email: null, slot: null, status: 'collected',
    items: [{ name: 'Garlic bread', quantity: 2, unit_price: 4, modifiers: [] }], deals: [], total: 8 },
  // An event that is in neither map (deleted since) — "Unknown event".
  { key: 7, id: '9', ev: 'ev-gone', date: '2026-10-06', at: '2026-10-06T11:00:00Z', name: 'Alex', email: 'alex@example.test', slot: '11:30', status: 'confirmed',
    items: [{ name: 'Coke', quantity: 1, unit_price: 1.8, modifiers: [] }], deals: [], total: 1.8 },
  // The event with no venue name (ev-d).
  { key: 8, id: '3', ev: 'ev-d', at: '2026-09-20T16:15:00Z', name: 'Morgan Lee', email: 'morgan@example.test', slot: '17:00', status: 'collected',
    items: [margherita(1)], deals: [], total: 10.75 },
]

/** `at` is the truck's WALL CLOCK when the order was placed (Oct/Sep 2026: BST for GB, CDT for the US) → the UTC instant. */
const placedAt = (at, cc) => new Date(Date.parse(at) + (cc === 'US' ? 5 : -1) * 3600e3).toISOString()
/** An order row as get_report returns it. `snap`: the Phase 3 snapshot columns (kept only when `charges` is present). */
function orderRow(r, C, snap) {
  const US = C.cc === 'US'
  const food = Math.round(r.total * 100)
  const tax = snap && US ? Math.round(food * 0.0825) : 0
  const tip = snap ? (r.tip || 0) : 0
  const fee = snap && US ? Math.round(food * 0.03) : 0
  const card = snap && US ? (r.card || 0) : 0
  const o = {
    order_key: `00000000-0000-4000-8000-0000000001${String(r.key).padStart(2, '0')}`, id: r.id, customer_name: r.name, customer_email: r.email,
    status: r.status, slot: r.slot, total: snap ? (food + tax + tip + fee + card) / 100 : r.total, discount_amt: 0, created_at: placedAt(r.at, C.cc),
    items: r.items.map(i => ({ ...i, modifiers: i.modifiers.map(m => ({ ...m })) })), deals: r.deals.map(d => ({ ...d, slots: { ...d.slots } })),
    event_date: r.date || (EVENTS[r.ev] && EVENTS[r.ev].event_date), event_id: r.ev || null,
    currency: C.fmt.currency,
  }
  if (snap) Object.assign(o, { food_minor: food, tax_minor: tax, tax_rate_milli: US ? 8250 : null, tax_label: US ? 'Sales tax' : null, tip_minor: tip, tip_pct_bps: tip ? 1000 : null, service_fee_minor: fee, card_surcharge_minor: card })
  return o
}
/** get_report's `report` for these raw orders and these events (the server's own sums). */
function report(C, keys, eventIds, { snap = false, taxLabel } = {}) {
  const orders = RAW.filter(r => keys.includes(r.key)).map(r => orderRow(r, C, snap))
  const eventsMap = {}, eventsByDate = {}
  for (const id of eventIds) { const e = EVENTS[id]; eventsMap[id] = { venue_name: venueOf(id, C.cc), town: e.town, van_id: e.van_id } }
  for (const id of eventIds) { const e = EVENTS[id]; if (!eventsByDate[e.event_date]) eventsByDate[e.event_date] = { venue_name: venueOf(id, C.cc), town: e.town } }
  const itemMap = {}
  for (const o of orders) for (const it of o.items) { (itemMap[it.name] ||= { qty: 0, revenue: 0 }); itemMap[it.name].qty += it.quantity || 1; itemMap[it.name].revenue += (it.unit_price || 0) * (it.quantity || 1) }
  const topItems = Object.entries(itemMap).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.qty - a.qty).slice(0, 10)
  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0)
  const sum = k => orders.reduce((s, o) => s + (Number(o[k]) || 0), 0)
  const charges = snap ? {
    taxAtCheckout: C.cc === 'US', taxLabel: taxLabel || (C.cc === 'US' ? 'Sales tax' : 'VAT'),
    foodMinor: sum('food_minor'), discount: 0, taxMinor: sum('tax_minor'), tipsMinor: sum('tip_minor'),
    serviceFeesMinor: sum('service_fee_minor'), cardSurchargesMinor: sum('card_surcharge_minor'),
  } : null
  return {
    totalOrders: orders.length, totalRevenue, avgOrder: totalRevenue / orders.length, topItems, dealsRedeemed: 0, dealSavings: 0, upsellRevenue: 0,
    whatsappStats: { total: 6, handled: 5, misses: 1 }, orders, eventsMap, eventsByDate, itemCategories: { ...CATEGORIES }, categoryOrder: [...CATEGORY_ORDER],
    ...(charges ? { charges } : {}),
  }
}

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS, safe } = ctx
  const out = {}
  const ST = states(M_FILE, ['filterMode', 'itemView', 'expandedOrders', 'dateFrom', 'dateTo', 'reportEventId', 'reportData', 'reportLoaded', 'recentEvents', 'loading', 'vans', 'vanFilter'])
  let M
  try {
    M = await kit.bundle('lp1d2-reports', [
      `export { ReportsTab } from '@/${M_FILE}'`,
      "export { vanFilterLabel, VAN_FILTER_ALL, VAN_FILTER_UNASSIGNED } from '@/components/manage/VanFilter'",
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: M_FILE, append: 'export { ReportsTab }' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el', optional: true },
        // The ⬇ Export CSV buttons' two handlers, reachable from the rendered closure (see the header).
        { file: M_FILE, from: 'const exportCSV = () => {', to: 'const exportCSV = (globalThis.__rptH ||= {}).exportCSV = () => {' },
        { file: M_FILE, from: 'const exportItemsCSV = () => {', to: 'const exportItemsCSV = (globalThis.__rptH ||= {}).exportItemsCSV = () => {' },
        { file: M_FILE, states: ST },
      ],
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }
  const api = async () => ({})

  /** Renders `state`, then runs the handler the ⬇ button would, with the browser's download machinery stubbed. */
  function download(state, el, which) {
    globalThis.__rptH = {}
    const page = html(state, el)
    if (typeof page !== 'string' || page.startsWith('ERROR')) return { error: page }
    const fn = globalThis.__rptH[which]
    delete globalThis.__rptH
    if (typeof fn !== 'function') return { error: `ERROR no ${which} handler reached` }
    const rec = { blobs: [], clicks: [], revoked: [] }
    const saved = { Blob: globalThis.Blob, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; rec.blobs.push(this) } }
    URL.createObjectURL = () => `blob:harness/${rec.blobs.length}`
    URL.revokeObjectURL = u => { rec.revoked.push(u) }
    globalThis.document = { createElement: tag => { const a = { tag, href: '', download: '', click() { rec.clicks.push({ tag, href: a.href, download: a.download }) } }; return a } }
    try { kit.quiet(() => fn()) } catch (e) { return { error: 'ERROR ' + String(e && e.message || e).slice(0, 300) } } finally {
      globalThis.Blob = saved.Blob; URL.createObjectURL = saved.create; URL.revokeObjectURL = saved.revoke
      if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document
    }
    if (!rec.blobs.length) return { csv: null, file: 'no download' }
    const b = rec.blobs[0]
    return { csv: b.parts.map(String).join(''), file: { type: b.type, parts: b.parts.length, clicks: rec.clicks, revoked: rec.revoked } }
  }

  for (const C of [GB, US]) {
    const cc = C.cc
    const W = el => inManage(M, C, el)
    const truck = { ...C.truck }
    const starter = { ...C.truck, plan: 'starter' }
    const tab = (t = truck) => W(h(M.ReportsTab, { truck: t, api }))
    const RECENT = recentOf(cc)
    const loaded = (data, extra = {}) => ({ reportData: data, reportLoaded: true, recentEvents: RECENT, ...extra })
    const ALL_EV = ['ev-a', 'ev-b', 'ev-c']
    const FULL = report(C, [1, 2, 3, 4, 5, 6, 7], ALL_EV, { snap: cc === 'US' })
    const EVENT_B = report(C, [3, 4], ['ev-b'], { snap: cc === 'US' })
    const EVENT_D = report(C, [8], ['ev-d'], { snap: cc === 'US' })
    const SINGLE = report(C, [1], ['ev-a'], { snap: cc === 'US' })
    const OTHER_ONLY = report(C, [4], ['ev-b'], { snap: cc === 'US' })   // "Other" only (GB: no snapshot — food = total, no extras; US always has charges)
    // GB: a range with a tip — `charges` present (VAT, inclusive) so the tips line and the CSV's four columns show.
    // US: the charges with a card surcharge as well (every extras line).
    const EXTRAS = report(C, [1, 3, 5], ['ev-a', 'ev-b', 'ev-c'], { snap: true })
    const v = (k, fn) => safe(out, `${cc}|${k}`, fn)

    // ── the tab ──
    v('tab|initial', () => html({}, tab()))
    v('tab|initialStarter', () => html({}, tab(starter)))
    v('tab|noTruck', () => html({}, tab(null)))
    v('tab|loading', () => html({ loading: true }, tab()))
    v('tab|loadingEvent', () => html({ filterMode: 'event', recentEvents: RECENT, reportEventId: 'ev-b', loading: true }, tab()))
    v('tab|empty', () => html({ reportData: null, reportLoaded: true }, tab()))
    v('tab|emptyEvent', () => html({ filterMode: 'event', recentEvents: RECENT, reportEventId: 'ev-c', reportData: null, reportLoaded: true }, tab()))
    v('tab|picker', () => html({ filterMode: 'event', recentEvents: RECENT, reportEventId: '' }, tab()))
    v('tab|pickerNone', () => html({ filterMode: 'event', recentEvents: [], reportEventId: '' }, tab()))
    v('tab|range|orders', () => html(loaded(FULL, { dateFrom: '2026-10-02', dateTo: '2026-10-08' }), tab()))
    v('tab|range|items', () => html(loaded(FULL, { itemView: 'items' }), tab()))
    v('tab|range|expanded', () => html(loaded(FULL, { expandedOrders: new Set(FULL.orders.slice(0, 4).map(o => o.order_key)) }), tab()))
    v('tab|range|starter', () => html(loaded(FULL, { filterMode: 'event', reportEventId: 'ev-a' }), tab(starter)))
    v('tab|event|orders', () => html(loaded(EVENT_B, { filterMode: 'event', reportEventId: 'ev-b' }), tab()))
    v('tab|event|items', () => html(loaded(EVENT_B, { filterMode: 'event', reportEventId: 'ev-b', itemView: 'items' }), tab()))
    v('tab|event|noVenue', () => html(loaded(EVENT_D, { filterMode: 'event', reportEventId: 'ev-d' }), tab()))
    v('tab|single', () => html(loaded(SINGLE), tab()))
    v('tab|otherOnly', () => html(loaded(OTHER_ONLY), tab()))
    v('tab|whatsappOnly', () => html(loaded({ whatsappStats: { total: 3, handled: 3, misses: 0 } }), tab()))
    v('tab|vans|all', () => html(loaded(FULL, { vans: VANS }), tab()))
    v('tab|vans|van1', () => html(loaded(FULL, { vans: VANS, vanFilter: 'v1' }), tab()))
    v('tab|vans|cafe', () => html(loaded(FULL, { vans: VANS, vanFilter: 'v2', itemView: 'items' }), tab()))
    v('tab|vans|unassigned', () => html(loaded(FULL, { vans: VANS, vanFilter: 'unassigned' }), tab()))
    v('tab|vans|deletedVan', () => html(loaded(FULL, { vans: VANS, vanFilter: 'v-gone' }), tab()))
    v('tab|vans|oneVan', () => html(loaded(FULL, { vans: VANS.slice(0, 1) }), tab()))
    v('tab|extras|orders', () => html(loaded(EXTRAS), tab()))
    v('tab|extras|items', () => html(loaded(EXTRAS, { itemView: 'items' }), tab()))

    // ── 🔴 the CSVs, as bytes ──
    const CASES = {
      range: loaded(FULL),
      event: loaded(EVENT_B, { filterMode: 'event', reportEventId: 'ev-b' }),
      eventNoVenue: loaded(EVENT_D, { filterMode: 'event', reportEventId: 'ev-d' }),
      single: loaded(SINGLE, { dateFrom: '2026-10-03', dateTo: '2026-10-03' }),
      vanCafe: loaded(FULL, { vans: VANS, vanFilter: 'v2' }),
      unassigned: loaded(FULL, { vans: VANS, vanFilter: 'unassigned' }),
      extras: loaded(EXTRAS),
      otherOnly: loaded(OTHER_ONLY),
    }
    const files = {}
    for (const [name, state] of Object.entries(CASES)) for (const [kind, which] of [['orders', 'exportCSV'], ['items', 'exportItemsCSV']]) {
      const r = download(state, tab(), which)
      if (r.error) { out[`${cc}|csv|${kind}|${name}`] = r.error; continue }
      // The other-only report is a screen case; its CSV only as the orders file (the items file adds nothing).
      if (!(name === 'otherOnly' && kind === 'items')) out[`${cc}|csv|${kind}|${name}`] = r.csv == null ? 'NO DOWNLOAD' : r.csv
      files[`${kind}|${name}`] = r.file
    }
    // An empty report: the handler returns before building a file.
    for (const [kind, which] of [['orders', 'exportCSV'], ['items', 'exportItemsCSV']]) {
      const r = download({ reportData: null, reportLoaded: true }, tab(), which)
      files[`${kind}|empty`] = r.error || r.file
    }
    out[`${cc}|csvfiles`] = files

    // ── vanFilterLabel (the chip on the totals line) ──
    v('vanLabel', () => {
      const o = {}
      for (const f of ['all', 'unassigned', 'v1', 'v2', 'v-gone']) {
        // No locale = the en-GB default (what 826471a's chip passed) — a GB reading only.
        if (cc === 'GB') o[`${f}|noLocale`] = M.vanFilterLabel(VANS, f)
        o[`${f}|${C.locale}`] = M.vanFilterLabel(VANS, f, C.locale)
      }
      return o
    })
  }
  return out
}

module.exports = { views }
