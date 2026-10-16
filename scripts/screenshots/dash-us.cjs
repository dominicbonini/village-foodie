#!/usr/bin/env node
// The REAL operator dashboard (app/dashboard/[token]/page.tsx) on its "+ Add order" tab with the REAL AddOrderPanel,
// server-rendered from a US fixture truck (render-kit state patches; nothing reaches a database or the network),
// painted in WebKit with the app's compiled CSS in a 1210x834pt viewport @2x (SAT env = the status-bar inset, default 24).
// Step 1 of the dashboard screenshot (frame-dash.cjs is step 2).
//   node dash-us.cjs <workDir> → <workDir>/dash-web.png (2420x1668) and dash-us.html
const fs = require('fs'); const path = require('path')
const { REPO, dirs, appCss, fontClasses, serve } = require('./common.cjs')
const { WORK } = dirs()
const kit = require('../_render-kit.cjs')({ cacheTag: 'us-screens-dash' })
const FIX = require('../_lp1b-fixtures.cjs')
const F = 'app/dashboard/[token]/page.tsx'
const AP = 'components/dashboard/AddOrderPanel.tsx'
const names = f => [...new Set([...fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(/const\s*\[\s*([a-zA-Z]+)\s*,\s*set[A-Za-z]+\s*\]\s*=\s*useState/g)].map(m => m[1]))]

const PIZZAS = [['BBQ Chicken', 15], ['Buffalo Chicken', 15], ['Cheese', 11], ['Chicago Classic', 16], ['Garden Veggie', 13], ['Ham & Mushroom', 14],
  ['Hawaiian', 14], ['Hot Honey Pepperoni', 15], ['Margherita', 12], ['Meat Lovers', 16], ['Pepperoni', 14], ['Philly Cheesesteak', 16],
  ['Sausage & Peppers', 15], ['Supreme', 16], ['White Pizza', 13], ['Spicy Italian', 15], ['Truffle Mushroom', 17], ['Cali Chicken', 15], ['Taco Pizza', 15], ['Pesto Chicken', 15], ['Mac & Cheese', 14]].sort((a, b) => a[0].localeCompare(b[0]))
const DRINKS = [['Coke', 2.5], ['Sprite', 2.5], ['Lemonade', 3], ['Iced Tea', 3]]
const DESSERTS = [['Cannoli', 6], ['Brownie', 5], ['Cookie', 3]]

;(async () => {
  kit.setNow('2026-09-02T03:21:00Z'); kit.setDeviceTz('America/Chicago'); kit.setDeviceLocale('en-US')   // Tue Sep 1, 10:21 PM in Chicago
  const R = await kit.bundle('dash', `export { default as Dash } from '@/${F}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: F, states: names(F) }, { file: F, from: 'const{token}=use(params)', to: 'const{token}=params' }, { file: AP, states: names(AP) }],
  })
  const US = FIX.country('US')
  const truck = { ...US.TRUCK, name: 'Pizza Kitchen', plan: 'max', feature_overrides: {}, trial_expires_at: null, add_order_layout: 'tabs', takes_cash: false,
    completion_presses: 'one', kds_mode: false, keep_screen_on: true, auto_accept: false, venue_name: null, show_paid_step: false }
  let n = 0
  const mk = (cat, [name, price]) => ({ id: `m${++n}`, name, price, category: cat, available: true, modifierGroups: [] })
  const items = [...PIZZAS.map(p => mk('Pizza', p)), ...DRINKS.map(p => mk('Drinks', p)), ...DESSERTS.map(p => mk('Desserts', p))]
  const MENU = { categories: [{ id: 'c1', name: 'Pizza' }, { id: 'c2', name: 'Drinks' }, { id: 'c3', name: 'Desserts' }], items, bundles: [], upsell_rules: [] }
  const EV = { ...US.EVENT, id: 'ev-1', event_date: '2026-09-02', date: '2026-09-02', start_time: '09:00', end_time: '17:00', venue_name: 'Riverside Park', town: 'Springfield',
    truck_id: truck.id, status: 'open', auto_open: true, closed_at: null, customer_note: null }
  const at = '2026-09-02T03:00:00.000Z'
  const order = (id, who, slot, list) => ({ id, order_key: `00000000-0000-4000-8000-0000000002${id.padStart(2, '0')}`, customer_name: who, customer_phone: null, customer_email: null, slot,
    requested_slot: null, asap_estimate: null, event_date: '2026-09-02', event_id: 'ev-1', van_id: null, status: 'pending', items: list.map(([name, q]) => ({ name, quantity: q, unit_price: 14, modifiers: [] })),
    deals: [], total: 28, notes: null, paid_at: null, collected_at: null, created_at: at, updated_at: at, payment_status: 'unpaid', order_type: 'collection', currency: 'USD', country: 'US' })
  const orders = [order('1', 'Ava', '09:15', [['Pepperoni', 2]]), order('2', 'Ben', '09:20', [['Supreme', 1]]), order('3', 'Cole', '09:30', [['Margherita', 2]])]
  const itemCategoryMap = Object.fromEntries(items.map(i => [i.name, i.category]))
  const price = Object.fromEntries(items.map(i => [i.name, i.price]))
  const basket = [['Margherita', 1], ['Pepperoni', 1], ['Ham & Mushroom', 1], ['Coke', 1], ['Sprite', 1], ['Cannoli', 2]]
    .map(([name, quantity]) => ({ name, quantity, unit_price: price[name], cartKey: name, modifiers: [] }))
  const state = {
    truck, orders, loading: false, authenticated: true, truckMenu: MENU, todayEvents: [], upcomingEvents: [EV], selectedEventId: 'ev-1', eventsLoaded: true,
    firstOpenChecked: true, fetchedStockKeys: new Set(['ev-1']), payments: {}, heldAuthorisations: new Set(), paymentFailures: new Set(), deviceOnline: true,
    activeTab: 'add', categoryOrder: ['Pizza', 'Drinks', 'Desserts'], itemCategoryMap, categoryConfigs: { pizza: { secs: 300, batch: 4 } }, wakeState: 'held',
    soundEnabled: true, activeVanCount: 1, currentUserEmail: 'dana@pizzakitchen.example',
    // AddOrderPanel
    manualItems: basket, manualName: 'Chloe', activeMenuCat: 'Pizza', manualEvent: EV,
    apiSlots: Array.from({ length: 48 }, (_, i) => { const m = 9 * 60 + 5 * i; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t, available: true, is_past: false, is_grace: false, remaining: 10 } }),
  }
  globalThis.__ms = state; globalThis.__msSearch = ''
  let body
  try { body = kit.renderStatic(kit.h(R.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, kit.h(R.Dash, { params: { token: 'harness' } }))) }
  finally { delete globalThis.__ms; delete globalThis.__msSearch }
  body = body.replace(/<img alt="Village Foodie"[^>]*>/g, '').replace(/\u270F(?!\uFE0F)/g, '\u270F\uFE0F')
  // The native app's WebView fills the screen under the status bar: env(safe-area-inset-top) is the iPad's inset there.
  body = body.replace(/env\(safe-area-inset-top\)/g, 'var(--sat)')
  const css = appCss()
  const page = () => `<!doctype html><html lang="en-US" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>:root{--sat:${process.env.SAT || 24}px}</style></head>
<body class="${fontClasses(css)}">${body}</body></html>`
  fs.writeFileSync(path.join(WORK, 'dash-us.html'), page())
  const srv = await serve(page)
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const pg = await browser.newPage({ viewport: { width: 1210, height: 834 }, deviceScaleFactor: 2 })
    await pg.goto(srv.url, { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200)
    console.log('dash', await pg.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight })))
    await pg.screenshot({ path: path.join(WORK, 'dash-web.png') })
  } finally { await browser.close(); srv.close() }
})().catch(e => { console.error(e); process.exit(1) })
