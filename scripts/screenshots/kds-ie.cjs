#!/usr/bin/env node
// IRELAND version of kds-us.cjs. The REAL kitchen screen (app/dashboard/[token]/kds/page.tsx), server-rendered from an IE fixture truck (render-kit
// state patches; nothing reaches a database or the network), painted in WebKit with the app's compiled CSS at a
// 13-inch iPad's 1376pt width @2x, below the iPadOS status bar's 24pt — the GB capture's composition.
// Step 1 of the IE kitchen screenshot (frame-kds-ie.cjs is step 2).
//   node kds-ie.cjs <workDir> → <workDir>/kds-web-ie.png (2752x2016) and kds-ie.html
const fs = require('fs'); const path = require('path')
const { REPO, dirs, appCss, fontClasses, serve } = require('./common.cjs')
const { WORK } = dirs()
const kit = require('../_render-kit.cjs')({ cacheTag: 'ie-screens-kds' })
const FIX = require('../_lp1b-fixtures.cjs')
const F = 'app/dashboard/[token]/kds/page.tsx'
const names = src => [...src.matchAll(/const \[([a-zA-Z]+), *set[A-Za-z]+\] *= *useState/g)].map(m => m[1])

// The menu: Irish pizza-truck names, € prices (the same as the IE order page and dashboard).
const PRICE = { 'Margherita': 12, 'Pepperoni': 15, 'Ham & Mushroom': 14, 'Supreme': 16, 'BBQ Chicken': 15, 'Meat Feast': 16, 'Hawaiian': 14,
  'Spicy Chicken': 15, 'Four Cheese': 13, 'Garden Veggie': 13, 'Chorizo & Pepper': 15, 'Hot Honey Pepperoni': 16, 'Coke': 2.5, '7Up': 2.5, 'Fanta': 2.5,
  'Tiramisu': 6, 'Brownie': 5 }
const CAT = n => (['Coke', '7Up', 'Fanta'].includes(n) ? 'Drinks' : ['Tiramisu', 'Brownie'].includes(n) ? 'Desserts' : 'Pizza')

;(async () => {
  kit.setNow('2026-09-01T20:08:00Z'); kit.setDeviceTz('Europe/Dublin'); kit.setDeviceLocale('en-IE')   // Tue 1 Sep, 21:08 in Dublin (IST) — the GB capture's clock
  const R = await kit.bundle('kds', `export { default as Kds } from '@/${F}'\nexport { I18nContext } from '@/lib/i18n/use-t'`,
    { patches: [{ file: F, states: names(fs.readFileSync(path.join(REPO, F), 'utf8')) }] })
  const GB = FIX.country('GB')   // the GB fixture's truck/event shape, with Ireland's money, time and phone over it
  const EUR = { currency: 'EUR', locale: 'en-IE' }
  const IE = { money: { ...EUR, localeByCountry: { IE: 'en-IE' } }, currency: 'EUR', country: 'IE',
    time: { timeZone: 'Europe/Dublin', locale: 'en-IE', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' },
    phone: { phoneCountry: 'IE', short_name: 'Ireland', phone_example: '085 123 4567', phoneCheck: 'length' } }
  const T = { ...GB.TRUCK, ...IE, name: 'Pizza Kitchen', plan: 'max', show_paid_step: true, kds_mode: true, takes_cash: false, completion_presses: 'one' }
  const EV = { ...GB.EVENT, id: 'ev-1', event_date: '2026-09-02', date: '2026-09-02', start_time: '09:00', end_time: '17:00', venue_name: "People's Park",
    town: 'Limerick', truck_id: T.id, status: 'open', auto_open: true, closed_at: null, customer_note: null }
  // [#, name, slot, status, [items]] — the GB board's shape: 3 and 7 and 8 ready (unpaid), 10 waiting to confirm, the rest confirmed.
  const ROWS = [
    [3, 'Aoife', '09:25', 'ready', ['Margherita', 'Pepperoni']],
    [4, 'Ciarán', '09:40', 'confirmed', ['Hawaiian', 'Coke']],
    [5, 'Niamh', '09:50', 'confirmed', ['BBQ Chicken', 'Supreme']],
    [6, 'Seán', '09:55', 'confirmed', ['Meat Feast', 'Tiramisu']],
    [7, 'Róisín', '10:05', 'ready', ['Spicy Chicken', 'Pepperoni', 'Fanta']],
    [8, 'Cian', '10:10', 'ready', ['Pepperoni']],
    [9, 'Saoirse', '10:20', 'confirmed', ['Four Cheese', 'Garden Veggie']],
    [10, 'Oisín', '10:30', 'pending', ['Hot Honey Pepperoni', '7Up']],
    [11, 'Caoimhe', '10:35', 'confirmed', ['Chorizo & Pepper', 'Margherita', 'Brownie']],
    [12, 'Pádraig', '10:45', 'confirmed', ['Supreme', 'Ham & Mushroom']],
    [13, 'Siobhán', '10:50', 'confirmed', ['Ham & Mushroom', 'Coke']],
    [14, 'Darragh', '10:55', 'confirmed', ['Meat Feast', 'Hawaiian']],
    [15, 'Clodagh', '11:05', 'confirmed', ['Garden Veggie', 'BBQ Chicken']],
    [16, 'Eoin', '11:10', 'confirmed', ['Margherita', 'Coke', 'Tiramisu']],
    [17, 'Méabh', '11:15', 'ready', ['Spicy Chicken', 'Four Cheese']],
    [18, 'Fionn', '11:20', 'confirmed', ['Pepperoni', 'Pepperoni', 'Fanta']],
    [19, 'Tadhg', '11:30', 'confirmed', ['Supreme', 'Coke']],
    [20, 'Áine', '11:35', 'confirmed', ['Margherita', '7Up']],
    [21, 'Orla', '11:45', 'confirmed', ['Hot Honey Pepperoni', 'Brownie']],
    [22, 'Conor', '11:50', 'confirmed', ['Chorizo & Pepper', 'Coke']],
  ]
  const at = '2026-09-01T19:30:00.000Z'
  const orders = ROWS.map(([n, who, slot, status, list], i) => {
    const counts = {}; for (const x of list) counts[x] = (counts[x] || 0) + 1
    const items = Object.entries(counts).map(([name, quantity]) => ({ name, quantity, unit_price: PRICE[name], modifiers: [] }))
    const total = items.reduce((s, x) => s + x.quantity * x.unit_price, 0)
    return { id: String(n), order_key: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, customer_name: who, customer_phone: '085 123 4567',
      customer_email: `${who.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}@example.test`, slot, requested_slot: null, asap_estimate: null, event_date: '2026-09-02', event_id: 'ev-1', van_id: null,
      status, items, deals: [], total, total_minor: Math.round(total * 100), notes: null, paid_at: null, collected_at: null, created_at: at, updated_at: at, placed_at: at,
      payment_status: 'unpaid', order_type: 'collection', buzzer_number: null, currency: 'EUR', country: 'IE', food_minor: Math.round(total * 100), tax_minor: 0,
      tax_rate_milli: null, tax_inclusive: true, tip_minor: 0, service_fee_minor: 0 }
  })
  const itemCategoryMap = Object.fromEntries(Object.keys(PRICE).map(n => [n, CAT(n)]))
  const state = { truck: T, orders, payments: {}, heldAuthorisations: new Set(), paymentFailures: new Set(), loading: false, hasLoaded: true, error: null, requiresPin: false,
    events: [EV], selectedEventId: 'ev-1', handoverPref: true, readyPref: true, prefsReconciled: true, layoutOverride: 'grid', cardModePref: 'window', showKdsIntro: false,
    isOffline: false, deviceOnline: true, wakeState: 'held', keepScreenOn: true, soundEnabled: true, storedSoundCfg: null, categoryOrder: ['Pizza', 'Drinks', 'Desserts'],
    itemCategoryMap, activeVanCount: 1, phoneOpen: false, deviceOpen: false, pausedUntil: null, onlinePausedUntil: null, extraWaitMins: 0, showCookingStep: false }
  globalThis.__ms = state; globalThis.__msSearch = ''
  let body
  try { body = kit.renderStatic(kit.h(R.I18nContext.Provider, { value: { locale: 'en-IE', setLocale() {} } }, kit.h(R.Kds, { token: 'harness' }))) }
  finally { delete globalThis.__ms; delete globalThis.__msSearch }
  const css = appCss()
  const page = () => `<!doctype html><html lang="en-IE" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body class="${fontClasses(css)}">${body}</body></html>`
  fs.writeFileSync(path.join(WORK, 'kds-ie.html'), page())
  const srv = await serve(page)
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const pg = await browser.newPage({ viewport: { width: 1376, height: 1008 }, deviceScaleFactor: 2 })
    await pg.goto(srv.url, { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200)
    console.log('kds', await pg.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight })))
    await pg.screenshot({ path: path.join(WORK, 'kds-web-ie.png') })
  } finally { await browser.close(); srv.close() }
})().catch(e => { console.error(e); process.exit(1) })
