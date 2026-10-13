#!/usr/bin/env node
// scripts/phase3-screens.cjs — Phase 3 screens: tax, tips and the service fee on every screen
// (docs/phase-3-screens-report.md).
//
//   node scripts/phase3-screens.cjs                    compare against the committed BEFORE snapshot
//   node scripts/phase3-screens.cjs --capture <file>   snapshot the current code's GB answers
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// BEFORE was captured on the tree as it stood before the first Phase 3 screens edit (Phase 3 foundations,
// uncommitted, on checkpoint 3033a53). It holds the GB answers this phase could change that
// scripts/money-sweep-parity.cjs does not already render: the public menu response, the order status API
// (an order from before Phase 3 and one with the Phase 3 snapshot) and the Reports route's `get_report`.
// money-sweep-parity keeps every rendered UK screen, email, ticket and CSV byte-identical; this file keeps
// these three, and then proves the US side (scripts/_phase3-screens-us.cjs) on fixtures.

const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'phase3-screens' })
const { REPO } = kit
const { makeFakePg } = require('./_fake-pg.cjs')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/phase3-screens-before.json'
const NOW = '2026-10-09T14:20:00.000Z'
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const ACCESS_HARNESS = { file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: "const access = { ok: true as const, role: 'owner' as const, userId: null, operatorId: null, via: 'harness' } as any" }

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

let M
async function mods() {
  if (M) return M
  M = {
    menu: await kit.bundle('menu', "export { GET } from '@/app/api/menu/[truckId]/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"),
    status: await kit.bundle('status', "export { GET } from '@/app/api/orders/[id]/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"),
    manage: await kit.bundle('manage', "export { POST } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { patches: [ACCESS_HARNESS] }),
  }
  return M
}
const clearCaches = () => { for (const m of Object.values(M)) m.clearCountrySettingsCache?.() }

/* ── Pizza Kitchen ── */
const GB = snake(SEEDS.gbFromSeed())
const US = snake(SEEDS.usFromSeed())
const TRUCK = (over = {}) => ({
  id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', active: true, paused: false, plan: 'pro', country: 'GB', currency: 'GBP',
  timezone: 'Europe/London', operator_id: 'op-test', mode: 'village', time_selection_enabled: true, show_on_vf: true, show_on_hg: true,
  contact_phone: '07700 900123', dashboard_token: 'tok-test', logo_storage_path: null, allow_customer_cancellation: true,
  cancellation_cutoff_mins: 30, ...over,
})
function menuTables(truckOver = {}, countryRows = [GB, US]) {
  return {
    trucks: [TRUCK(truckOver)],
    country_settings: countryRows,
    menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas', sort_order: 1, active: true }],
    menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 12, category_id: 'c1', category: 'Pizzas', available: true, sort_order: 1 }],
    bundles_db: [], upsell_rules: [], discount_codes_db: [],
    modifier_groups: [], modifier_options: [], item_modifier_groups: [], truck_events: [], event_deals: [], truck_vans: [],
    operators: [{ id: 'op-test', stripe_account_id: null, charges_enabled: false }],
  }
}
async function menuView(tables) {
  await mods()
  globalThis.__harnessDb = kit.fakeDb(tables); clearCaches()
  try {
    const res = await kit.quietAsync(() => M.menu.GET(new NextRequest('http://127.0.0.1:3999/api/menu/test-kitchen'), { params: Promise.resolve({ truckId: 'test-kitchen' }) }))
    return { status: res.status, body: await res.json() }
  } finally { delete globalThis.__harnessDb }
}

/* ── the order status API ── */
const ORDER_BASE = {
  order_key: 'ok-status-1', id: '17', status: 'confirmed', customer_name: 'Ann Example', customer_email: 'ann@example.test',
  slot: '12:30', requested_slot: '12:30', asap_estimate: null, event_date: '2026-10-09',
  items: [{ name: 'Margherita', quantity: 2, unit_price: 12 }], deals: [], deal_savings: null,
  total: 24, total_minor: 2400, payment_status: 'unpaid', truck_id: 'test-truck', currency: 'GBP', country: 'GB',
}
const GB_SNAPSHOT = {
  food_minor: 2400, tax_minor: 0, tax_rate_bps: null, tax_rate_milli: null, tax_inclusive: true, tax_label: 'VAT', tip_minor: 0, tip_pct_bps: null,
  service_fee_minor: 0, service_fee_recipient: null, card_surcharge_minor: 0, card_funding: null, card_fee_payer: 'truck', application_fee_minor: null,
}
function statusTables(order, truckOver = {}, countryRows = [GB, US]) {
  const truck = TRUCK(truckOver)
  return {
    orders: [{ ...order, trucks: { name: truck.name, slug: truck.slug, logo_storage_path: null, allow_customer_cancellation: true, cancellation_cutoff_mins: 30, timezone: truck.timezone, country: truck.country } }],
    trucks: [truck], country_settings: countryRows, truck_events: [{ truck_id: 'test-truck', event_date: '2026-10-09', venue_name: 'The Green' }],
  }
}
async function statusView(tables, key = 'ok-status-1') {
  await mods()
  globalThis.__harnessDb = kit.fakeDb(tables); clearCaches()
  try {
    const res = await kit.quietAsync(() => M.status.GET(new NextRequest(`http://127.0.0.1:3999/api/orders/${key}`), { params: Promise.resolve({ id: key }) }))
    return { status: res.status, body: await res.json() }
  } finally { delete globalThis.__harnessDb }
}

/* ── get_report ── */
function reportOrders(withSnapshot) {
  const mk = (n, total, over = {}) => ({
    order_key: `ok-r-${n}`, id: String(n), customer_name: 'Bob', customer_email: n % 2 ? 'bob@example.test' : null, status: 'confirmed',
    slot: '12:00', total, discount_amt: 0, created_at: '2026-10-09T11:00:00.000Z', items: [{ name: 'Margherita', quantity: 1, unit_price: total }],
    deals: [], event_date: '2026-10-09', event_id: 'ev1', truck_id: 'test-truck', total_minor: Math.round(total * 100),
    ...(withSnapshot ? { ...GB_SNAPSHOT, food_minor: Math.round(total * 100) } : {}), ...over,
  })
  return [mk(1, 12), mk(2, 24), mk(3, 9.5, { discount_amt: 1 }), mk(4, 30, { status: 'cancelled' })]
}
function reportTables(orders, truckOver = {}, countryRows = [GB, US]) {
  return {
    trucks: [TRUCK(truckOver)], country_settings: countryRows, orders,
    truck_events: [{ id: 'ev1', truck_id: 'test-truck', event_date: '2026-10-09', venue_name: 'The Green', town: 'Testville', van_id: null }],
    whatsapp_logs: [], menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas', sort_order: 1, is_active: true }],
    menu_items_db: [{ name: 'Margherita', category_id: 'c1', truck_id: 'test-truck' }],
  }
}
/* ⚠️ THE FAKE IGNORES A SELECT'S COLUMN LIST, and the real database does not: a route that never names
 * `food_minor` never receives it. So the `orders` read is PROJECTED to the columns the route names — or
 * BEFORE would hold columns the old code never asked for. */
function projecting(pg) {
  return { ...pg, from(t) {
    const q = pg.from(t)
    if (t !== 'orders') return q
    let cols = null
    const wrap = obj => new Proxy(obj, { get(o, k) {
      if (k === 'select') return (c, ...rest) => { if (typeof c === 'string' && !/[*(]/.test(c)) cols = c.split(',').map(x => x.trim()); return wrap(o.select(c, ...rest)) }
      if (k === 'then') return (res, rej) => o.then(r => {
        if (cols && r && Array.isArray(r.data)) r = { ...r, data: r.data.map(row => Object.fromEntries(cols.filter(cn => cn in row).map(cn => [cn, row[cn]]))) }
        return res(r)
      }, rej)
      const v = o[k]
      return typeof v === 'function' ? (...a) => { const out = v.apply(o, a); return out === o ? wrap(o) : out } : v
    } })
    return wrap(q)
  } }
}
async function reportView(tables) {
  await mods()
  const pg = projecting(makeFakePg(tables))
  globalThis.__harnessDb = pg; clearCaches()
  try {
    const res = await kit.quietAsync(() => M.manage.POST(new NextRequest('http://127.0.0.1:3999/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'tok-test', action: 'get_report', dateFrom: '2026-10-09', dateTo: '2026-10-09' }) })))
    return { status: res.status, body: await res.json() }
  } finally { delete globalThis.__harnessDb }
}

async function gbViews() {
  kit.setNow(NOW); kit.setDeviceTz('Europe/London')
  return {
    menu: await menuView(menuTables()),
    statusLegacy: await statusView(statusTables(ORDER_BASE)),
    statusSnapshot: await statusView(statusTables({ ...ORDER_BASE, ...GB_SNAPSHOT })),
    reportLegacy: await reportView(reportTables(reportOrders(false))),
    reportSnapshot: await reportView(reportTables(reportOrders(true))),
  }
}

function diffJson(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diffJson(a[k], b[k], `${p}.${k}`); if (d) return d }
  }
  return `${p}: BEFORE ${JSON.stringify(a)?.slice(0, 200)} · AFTER ${JSON.stringify(b)?.slice(0, 200)}`
}

async function main() {
  const got = await gbViews()
  if (CAPTURE) {
    fs.writeFileSync(path.resolve(REPO, CAPTURE), JSON.stringify({ captured_on: 'Phase 3 foundations tree (on checkpoint 3033a53), before any Phase 3 screens edit', views: got }, null, 1) + '\n')
    for (const [k, v] of Object.entries(got)) console.log(`  ${k}: ${v.status} ${JSON.stringify(v.body).slice(0, 120)}`)
    console.log(`captured → ${CAPTURE}`)
    return
  }
  head('1 · GB: the menu response, the status API and get_report are byte-identical to BEFORE')
  const before = JSON.parse(read(BEFORE_FILE)).views
  for (const [k, b] of Object.entries(before)) {
    const d = diffJson(b, got[k])
    t(`${k}: byte-identical to BEFORE`, d === null, d)
  }
  if (fs.existsSync(path.join(REPO, 'lib/order-charge-lines.ts'))) {
    await require('./_phase3-screens-us.cjs')({ kit, mods, t, head, read, REPO, menuView, menuTables, statusView, statusTables, reportView, reportTables, reportOrders, ORDER_BASE, GB, US, TRUCK, makeFakePg, NextRequest, snake, SEEDS })
  }
  console.log(`\n${fail ? '✗' : '✓'} phase3-screens: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
