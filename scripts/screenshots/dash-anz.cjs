#!/usr/bin/env node
// AUSTRALIA / NEW ZEALAND version of dash-ie.cjs. The REAL operator dashboard (app/dashboard/[token]/page.tsx) on its "+ Add order"
// tab with the REAL AddOrderPanel, server-rendered from an AU or NZ fixture truck (anz-fixtures.cjs: AUD/NZD, en-AU/en-NZ, 12-hour,
// Sydney/Auckland) (render-kit state patches; nothing reaches a database or the network), painted in WebKit with the app's
// compiled CSS in a 1210x834pt viewport @2x (SAT env = the status-bar inset, default 24).
// Step 1 of the AU/NZ dashboard screenshot (frame-dash-anz.cjs is step 2).
//   node dash-anz.cjs <au|nz> <workDir> → <workDir>/dash-web-<au|nz>.png (2420x1668) and dash-<au|nz>.html
const fs = require('fs'); const path = require('path')
const A = require('./anz-fixtures.cjs')
const c = A.country()
const { REPO, dirs, appCss, fontClasses, serve } = require('./common.cjs')
const { WORK } = dirs()
const kit = require('../_render-kit.cjs')({ cacheTag: `anz-screens-dash-${c.key}` })
const FIX = require('../_lp1b-fixtures.cjs')
const F = 'app/dashboard/[token]/page.tsx'
const AP = 'components/dashboard/AddOrderPanel.tsx'
const names = f => [...new Set([...fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(/const\s*\[\s*([a-zA-Z]+)\s*,\s*set[A-Za-z]+\s*\]\s*=\s*useState/g)].map(m => m[1]))]

;(async () => {
  const NOW = A.instant(c, '2026-09-01', '22:21')   // Tue 1 Sep, 10:21 pm local — the GB capture's clock (22:21), in 12-hour form
  kit.setNow(NOW); kit.setDeviceTz(c.timeZone); kit.setDeviceLocale(c.locale)
  console.log(c.key, 'now', NOW, A.clock(c, NOW))
  const R = await kit.bundle('dash', `export { default as Dash } from '@/${F}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: F, states: names(F) }, { file: F, from: 'const{token}=use(params)', to: 'const{token}=params' }, { file: AP, states: names(AP) }],
  })
  const GB = FIX.country('GB')   // the GB fixture's truck/event shape, with the country's money, time and phone over it
  const truck = { ...GB.TRUCK, ...c.settings, name: 'Pizza Kitchen', plan: 'max', feature_overrides: {}, trial_expires_at: null, add_order_layout: 'tabs', takes_cash: false,
    completion_presses: 'one', kds_mode: false, keep_screen_on: true, auto_accept: false, venue_name: null, show_paid_step: false }
  let n = 0
  // c.n / c.cat: the country's own dish and category names (France's tables); the English key itself for AU/NZ/CA.
  const mk = (cat, name) => ({ id: `m${++n}`, name, price: c.price[name], category: c.cat(cat), available: true, modifierGroups: [] })
  const items = [...A.PIZZAS.map(c.n).sort((a, b) => a.localeCompare(b)).map(p => mk('Pizza', p)), ...c.drinks.map(c.n).map(p => mk('Drinks', p)), ...A.DESSERTS.map(c.n).map(p => mk('Desserts', p))]
  const MENU = { categories: [{ id: 'c1', name: c.cat('Pizza') }, { id: 'c2', name: c.cat('Drinks') }, { id: 'c3', name: c.cat('Desserts') }], items, bundles: [], upsell_rules: [] }
  const EV = { ...GB.EVENT, id: 'ev-1', event_date: c.eventYmd, date: c.eventYmd, start_time: '09:00', end_time: '17:00', venue_name: c.venue, town: c.town,
    truck_id: truck.id, status: 'open', auto_open: true, closed_at: null, customer_note: null }
  const at = new Date(Date.parse(NOW) - 21 * 60000).toISOString()   // placed 21 minutes before "now", as in the IE fixture
  const order = (id, who, slot, list) => {
    const lines = list.map(([key, q]) => ({ name: c.n(key), quantity: q, unit_price: c.price[c.n(key)], modifiers: [] }))
    return { id, order_key: `00000000-0000-4000-8000-0000000002${id.padStart(2, '0')}`, customer_name: who, customer_phone: null, customer_email: null, slot,
      requested_slot: null, asap_estimate: null, event_date: c.eventYmd, event_id: 'ev-1', van_id: null, status: 'pending', items: lines,
      deals: [], total: lines.reduce((s, x) => s + x.quantity * x.unit_price, 0), notes: null, paid_at: null, collected_at: null, created_at: at, updated_at: at,
      payment_status: 'unpaid', order_type: 'collection', currency: c.currency, country: c.cc }
  }
  const [q1, q2, q3] = c.dashQueue
  const orders = [order('1', q1, '09:15', [['Pepperoni', 2]]), order('2', q2, '09:20', [['Supreme', 1]]), order('3', q3, '09:30', [['Margherita', 2]])]
  const itemCategoryMap = Object.fromEntries(items.map(i => [i.name, i.category]))
  const basket = [['Margherita', 1], ['Pepperoni', 1], ['Ham & Mushroom', 1], ['Coke', 1], [c.drinks[1], 1], ['Tiramisu', 2]]
    .map(([key, quantity]) => ({ name: c.n(key), quantity, unit_price: c.price[c.n(key)], cartKey: c.n(key), modifiers: [] }))
  const state = {
    truck, orders, loading: false, authenticated: true, truckMenu: MENU, todayEvents: [], upcomingEvents: [EV], selectedEventId: 'ev-1', eventsLoaded: true,
    firstOpenChecked: true, fetchedStockKeys: new Set(['ev-1']), payments: {}, heldAuthorisations: new Set(), paymentFailures: new Set(), deviceOnline: true,
    activeTab: 'add', categoryOrder: ['Pizza', 'Drinks', 'Desserts'].map(c.cat), itemCategoryMap, categoryConfigs: { [c.cat('Pizza').toLowerCase()]: { secs: 300, batch: 4 } }, wakeState: 'held',
    soundEnabled: true, activeVanCount: 1, currentUserEmail: c.staff,
    // AddOrderPanel
    manualItems: basket, manualName: c.dashName, activeMenuCat: c.cat('Pizza'), manualEvent: EV,
    apiSlots: Array.from({ length: 48 }, (_, i) => { const m = 9 * 60 + 5 * i; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t, available: true, is_past: false, is_grace: false, remaining: 10 } }),
  }
  globalThis.__ms = state; globalThis.__msSearch = ''
  let body
  try { body = kit.renderStatic(kit.h(R.I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, kit.h(R.Dash, { params: { token: 'harness' } }))) }
  finally { delete globalThis.__ms; delete globalThis.__msSearch }
  body = body.replace(/<img alt="Village Foodie"[^>]*>/g, '').replace(/✏(?!️)/g, '✏️')
  // The native app's WebView fills the screen under the status bar: env(safe-area-inset-top) is the iPad's inset there.
  body = body.replace(/env\(safe-area-inset-top\)/g, 'var(--sat)')
  const css = appCss()
  const page = () => `<!doctype html><html lang="${c.locale}" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>:root{--sat:${process.env.SAT || 24}px}</style></head>
<body class="${fontClasses(css)}">${body}</body></html>`
  fs.writeFileSync(path.join(WORK, `dash-${c.key}.html`), page())
  const srv = await serve(page)
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const pg = await browser.newPage({ viewport: { width: 1210, height: 834 }, deviceScaleFactor: 2 })
    await pg.goto(srv.url, { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200)
    console.log('dash', await pg.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight })))
    await pg.screenshot({ path: path.join(WORK, `dash-web-${c.key}.png`) })
  } finally { await browser.close(); srv.close() }
})().catch(e => { console.error(e); process.exit(1) })
