#!/usr/bin/env node
// IRELAND version of dash-us.cjs. The REAL operator dashboard (app/dashboard/[token]/page.tsx) on its "+ Add order" tab with the REAL AddOrderPanel,
// server-rendered from an IE fixture truck (EUR, en-IE, 24-hour, Dublin) (render-kit state patches; nothing reaches a database or the network),
// painted in WebKit with the app's compiled CSS in a 1210x834pt viewport @2x (SAT env = the status-bar inset, default 24).
// Step 1 of the IE dashboard screenshot (frame-dash-ie.cjs is step 2).
//   node dash-ie.cjs <workDir> → <workDir>/dash-web-ie.png (2420x1668) and dash-ie.html
const fs = require('fs'); const path = require('path')
const { REPO, dirs, appCss, fontClasses, serve } = require('./common.cjs')
const { WORK } = dirs()
const kit = require('../_render-kit.cjs')({ cacheTag: 'ie-screens-dash' })
const FIX = require('../_lp1b-fixtures.cjs')
const F = 'app/dashboard/[token]/page.tsx'
const AP = 'components/dashboard/AddOrderPanel.tsx'
const names = f => [...new Set([...fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(/const\s*\[\s*([a-zA-Z]+)\s*,\s*set[A-Za-z]+\s*\]\s*=\s*useState/g)].map(m => m[1]))]

const PIZZAS = [['BBQ Chicken', 15], ['Spicy Chicken', 15], ['Four Cheese', 13], ['Chorizo & Pepper', 15], ['Garden Veggie', 13], ['Ham & Mushroom', 14],
  ['Hawaiian', 14], ['Hot Honey Pepperoni', 16], ['Margherita', 12], ['Meat Feast', 16], ['Pepperoni', 15], ['Tandoori Chicken', 15],
  ['Calzone', 15], ['Supreme', 16], ['Marinara', 10], ['Spicy Salami', 15], ['Truffle Mushroom', 17], ['Goat’s Cheese', 15], ['Nduja & Honey', 16], ['Pesto Chicken', 15], ['Garlic Bread', 6]].sort((a, b) => a[0].localeCompare(b[0]))
const DRINKS = [['Coke', 2.5], ['7Up', 2.5], ['Fanta', 2.5], ['Water', 2]]
const DESSERTS = [['Tiramisu', 6], ['Brownie', 5], ['Cookie', 3]]

;(async () => {
  kit.setNow('2026-09-01T21:21:00Z'); kit.setDeviceTz('Europe/Dublin'); kit.setDeviceLocale('en-IE')   // Tue 1 Sep, 22:21 in Dublin (IST) — the GB capture's clock
  const R = await kit.bundle('dash', `export { default as Dash } from '@/${F}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: F, states: names(F) }, { file: F, from: 'const{token}=use(params)', to: 'const{token}=params' }, { file: AP, states: names(AP) }],
  })
  const GB = FIX.country('GB')   // the GB fixture's truck/event shape, with Ireland's money, time and phone over it
  const EUR = { currency: 'EUR', locale: 'en-IE' }
  const IE = { money: { ...EUR, localeByCountry: { IE: 'en-IE' } }, currency: 'EUR', country: 'IE',
    time: { timeZone: 'Europe/Dublin', locale: 'en-IE', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' },
    phone: { phoneCountry: 'IE', short_name: 'Ireland', phone_example: '085 123 4567', phoneCheck: 'length' } }
  const truck = { ...GB.TRUCK, ...IE, name: 'Pizza Kitchen', plan: 'max', feature_overrides: {}, trial_expires_at: null, add_order_layout: 'tabs', takes_cash: false,
    completion_presses: 'one', kds_mode: false, keep_screen_on: true, auto_accept: false, venue_name: null, show_paid_step: false }
  let n = 0
  const mk = (cat, [name, price]) => ({ id: `m${++n}`, name, price, category: cat, available: true, modifierGroups: [] })
  const items = [...PIZZAS.map(p => mk('Pizza', p)), ...DRINKS.map(p => mk('Drinks', p)), ...DESSERTS.map(p => mk('Desserts', p))]
  const MENU = { categories: [{ id: 'c1', name: 'Pizza' }, { id: 'c2', name: 'Drinks' }, { id: 'c3', name: 'Desserts' }], items, bundles: [], upsell_rules: [] }
  const EV = { ...GB.EVENT, id: 'ev-1', event_date: '2026-09-02', date: '2026-09-02', start_time: '09:00', end_time: '17:00', venue_name: 'People\'s Park', town: 'Limerick',
    truck_id: truck.id, status: 'open', auto_open: true, closed_at: null, customer_note: null }
  const at = '2026-09-01T21:00:00.000Z'
  const order = (id, who, slot, list) => ({ id, order_key: `00000000-0000-4000-8000-0000000002${id.padStart(2, '0')}`, customer_name: who, customer_phone: null, customer_email: null, slot,
    requested_slot: null, asap_estimate: null, event_date: '2026-09-02', event_id: 'ev-1', van_id: null, status: 'pending', items: list.map(([name, q]) => ({ name, quantity: q, unit_price: 15, modifiers: [] })),
    deals: [], total: 30, notes: null, paid_at: null, collected_at: null, created_at: at, updated_at: at, payment_status: 'unpaid', order_type: 'collection', currency: 'EUR', country: 'IE' })
  const orders = [order('1', 'Aoife', '09:15', [['Pepperoni', 2]]), order('2', 'Ciarán', '09:20', [['Supreme', 1]]), order('3', 'Niamh', '09:30', [['Margherita', 2]])]
  const itemCategoryMap = Object.fromEntries(items.map(i => [i.name, i.category]))
  const price = Object.fromEntries(items.map(i => [i.name, i.price]))
  const basket = [['Margherita', 1], ['Pepperoni', 1], ['Ham & Mushroom', 1], ['Coke', 1], ['7Up', 1], ['Tiramisu', 2]]
    .map(([name, quantity]) => ({ name, quantity, unit_price: price[name], cartKey: name, modifiers: [] }))
  const state = {
    truck, orders, loading: false, authenticated: true, truckMenu: MENU, todayEvents: [], upcomingEvents: [EV], selectedEventId: 'ev-1', eventsLoaded: true,
    firstOpenChecked: true, fetchedStockKeys: new Set(['ev-1']), payments: {}, heldAuthorisations: new Set(), paymentFailures: new Set(), deviceOnline: true,
    activeTab: 'add', categoryOrder: ['Pizza', 'Drinks', 'Desserts'], itemCategoryMap, categoryConfigs: { pizza: { secs: 300, batch: 4 } }, wakeState: 'held',
    soundEnabled: true, activeVanCount: 1, currentUserEmail: 'orla@pizzakitchen.example',
    // AddOrderPanel
    manualItems: basket, manualName: 'Róisín', activeMenuCat: 'Pizza', manualEvent: EV,
    apiSlots: Array.from({ length: 48 }, (_, i) => { const m = 9 * 60 + 5 * i; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; return { collection_time: t, production_slot: t, available: true, is_past: false, is_grace: false, remaining: 10 } }),
  }
  globalThis.__ms = state; globalThis.__msSearch = ''
  let body
  try { body = kit.renderStatic(kit.h(R.I18nContext.Provider, { value: { locale: 'en-IE', setLocale() {} } }, kit.h(R.Dash, { params: { token: 'harness' } }))) }
  finally { delete globalThis.__ms; delete globalThis.__msSearch }
  body = body.replace(/<img alt="Village Foodie"[^>]*>/g, '').replace(/\u270F(?!\uFE0F)/g, '\u270F\uFE0F')
  // The native app's WebView fills the screen under the status bar: env(safe-area-inset-top) is the iPad's inset there.
  body = body.replace(/env\(safe-area-inset-top\)/g, 'var(--sat)')
  const css = appCss()
  const page = () => `<!doctype html><html lang="en-IE" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>:root{--sat:${process.env.SAT || 24}px}</style></head>
<body class="${fontClasses(css)}">${body}</body></html>`
  fs.writeFileSync(path.join(WORK, 'dash-ie.html'), page())
  const srv = await serve(page)
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const pg = await browser.newPage({ viewport: { width: 1210, height: 834 }, deviceScaleFactor: 2 })
    await pg.goto(srv.url, { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200)
    console.log('dash', await pg.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight })))
    await pg.screenshot({ path: path.join(WORK, 'dash-web-ie.png') })
  } finally { await browser.close(); srv.close() }
})().catch(e => { console.error(e); process.exit(1) })
