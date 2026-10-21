#!/usr/bin/env node
// AUSTRALIA / NEW ZEALAND version of kds-ie.cjs. The REAL kitchen screen (app/dashboard/[token]/kds/page.tsx), server-rendered from
// an AU or NZ fixture truck (anz-fixtures.cjs; render-kit state patches, nothing reaches a database or the network), painted in
// WebKit with the app's compiled CSS at a 13-inch iPad's 1376pt width @2x, below the iPadOS status bar's 24pt — the GB capture's
// composition. Step 1 of the AU/NZ kitchen screenshot (frame-kds-anz.cjs is step 2).
//   node kds-anz.cjs <au|nz> <workDir> → <workDir>/kds-web-<au|nz>.png (2752x2016) and kds-<au|nz>.html
const fs = require('fs'); const path = require('path')
const A = require('./anz-fixtures.cjs')
const c = A.country()
const { REPO, dirs, appCss, fontClasses, serve } = require('./common.cjs')
const { WORK } = dirs()
const kit = require('../_render-kit.cjs')({ cacheTag: `anz-screens-kds-${c.key}` })
const FIX = require('../_lp1b-fixtures.cjs')
const F = 'app/dashboard/[token]/kds/page.tsx'
const names = src => [...src.matchAll(/const \[([a-zA-Z]+), *set[A-Za-z]+\] *= *useState/g)].map(m => m[1])

;(async () => {
  const NOW = A.instant(c, '2026-09-01', '21:08')   // Tue 1 Sep, 9:08 pm local — the GB capture's clock (21:08), in 12-hour form
  kit.setNow(NOW); kit.setDeviceTz(c.timeZone); kit.setDeviceLocale(c.locale)
  console.log(c.key, 'now', NOW, A.clock(c, NOW))
  const R = await kit.bundle('kds', `export { default as Kds } from '@/${F}'\nexport { I18nContext } from '@/lib/i18n/use-t'`,
    { patches: [{ file: F, states: names(fs.readFileSync(path.join(REPO, F), 'utf8')) }] })
  const GB = FIX.country('GB')   // the GB fixture's truck/event shape, with the country's money, time and phone over it
  const T = { ...GB.TRUCK, ...c.settings, name: 'Pizza Kitchen', plan: 'max', show_paid_step: true, kds_mode: true, takes_cash: false, completion_presses: 'one' }
  const EV = { ...GB.EVENT, id: 'ev-1', event_date: '2026-09-02', date: '2026-09-02', start_time: '09:00', end_time: '17:00', venue_name: c.venue,
    town: c.town, truck_id: T.id, status: 'open', auto_open: true, closed_at: null, customer_note: null }
  const [dA, dB, dC] = c.drinks
  // [#, slot, status, [items]] — the GB board's shape: 3 and 7 and 8 and 17 ready (unpaid), 10 waiting to confirm, the rest confirmed.
  // Names come from the country's list, in order.
  const ROWS = [
    [3, '09:25', 'ready', ['Margherita', 'Pepperoni']],
    [4, '09:40', 'confirmed', ['Hawaiian', dA]],
    [5, '09:50', 'confirmed', ['BBQ Chicken', 'Supreme']],
    [6, '09:55', 'confirmed', ['Meat Lovers', 'Tiramisu']],
    [7, '10:05', 'ready', ['Spicy Chicken', 'Pepperoni', dC]],
    [8, '10:10', 'ready', ['Pepperoni']],
    [9, '10:20', 'confirmed', ['Four Cheese', 'Garden Veggie']],
    [10, '10:30', 'pending', ['Hot Honey Pepperoni', dB]],
    [11, '10:35', 'confirmed', ['Chorizo & Pepper', 'Margherita', 'Brownie']],
    [12, '10:45', 'confirmed', ['Supreme', 'Ham & Mushroom']],
    [13, '10:50', 'confirmed', ['Ham & Mushroom', dA]],
    [14, '10:55', 'confirmed', ['Meat Lovers', 'Hawaiian']],
    [15, '11:05', 'confirmed', ['Garden Veggie', 'BBQ Chicken']],
    [16, '11:10', 'confirmed', ['Margherita', dA, 'Tiramisu']],
    [17, '11:15', 'ready', ['Spicy Chicken', 'Four Cheese']],
    [18, '11:20', 'confirmed', ['Pepperoni', 'Pepperoni', dC]],
    [19, '11:30', 'confirmed', ['Supreme', dA]],
    [20, '11:35', 'confirmed', ['Margherita', dB]],
    [21, '11:45', 'confirmed', ['Hot Honey Pepperoni', 'Brownie']],
    [22, '11:50', 'confirmed', ['Chorizo & Pepper', dA]],
  ]
  const at = new Date(Date.parse(NOW) - 38 * 60000).toISOString()   // placed 38 minutes before "now", as in the IE fixture
  const orders = ROWS.map(([n, slot, status, list], i) => {
    const who = c.kdsNames[i]
    const counts = {}; for (const x of list) counts[x] = (counts[x] || 0) + 1
    const items = Object.entries(counts).map(([name, quantity]) => ({ name, quantity, unit_price: c.price[name], modifiers: [] }))
    const total = items.reduce((s, x) => s + x.quantity * x.unit_price, 0)
    return { id: String(n), order_key: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, customer_name: who, customer_phone: c.phone.phone_example,
      customer_email: `${who.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}@example.test`, slot, requested_slot: null, asap_estimate: null, event_date: '2026-09-02', event_id: 'ev-1', van_id: null,
      status, items, deals: [], total, total_minor: Math.round(total * 100), notes: null, paid_at: null, collected_at: null, created_at: at, updated_at: at, placed_at: at,
      payment_status: 'unpaid', order_type: 'collection', buzzer_number: null, currency: c.currency, country: c.cc, food_minor: Math.round(total * 100), tax_minor: 0,
      tax_rate_milli: null, tax_inclusive: true, tip_minor: 0, service_fee_minor: 0 }
  })
  const used = [...new Set(ROWS.flatMap(r => r[3]))]
  const CAT = n => (c.drinks.includes(n) ? 'Drinks' : A.DESSERTS.includes(n) ? 'Desserts' : 'Pizza')
  const itemCategoryMap = Object.fromEntries(used.map(n => [n, CAT(n)]))
  const state = { truck: T, orders, payments: {}, heldAuthorisations: new Set(), paymentFailures: new Set(), loading: false, hasLoaded: true, error: null, requiresPin: false,
    events: [EV], selectedEventId: 'ev-1', handoverPref: true, readyPref: true, prefsReconciled: true, layoutOverride: 'grid', cardModePref: 'window', showKdsIntro: false,
    isOffline: false, deviceOnline: true, wakeState: 'held', keepScreenOn: true, soundEnabled: true, storedSoundCfg: null, categoryOrder: ['Pizza', 'Drinks', 'Desserts'],
    itemCategoryMap, activeVanCount: 1, phoneOpen: false, deviceOpen: false, pausedUntil: null, onlinePausedUntil: null, extraWaitMins: 0, showCookingStep: false }
  globalThis.__ms = state; globalThis.__msSearch = ''
  let body
  try { body = kit.renderStatic(kit.h(R.I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, kit.h(R.Kds, { token: 'harness' }))) }
  finally { delete globalThis.__ms; delete globalThis.__msSearch }
  const css = appCss()
  const page = () => `<!doctype html><html lang="${c.locale}" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body class="${fontClasses(css)}">${body}</body></html>`
  fs.writeFileSync(path.join(WORK, `kds-${c.key}.html`), page())
  const srv = await serve(page)
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const pg = await browser.newPage({ viewport: { width: 1376, height: 1008 }, deviceScaleFactor: 2 })
    await pg.goto(srv.url, { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200)
    console.log('kds', await pg.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight })))
    await pg.screenshot({ path: path.join(WORK, `kds-web-${c.key}.png`) })
  } finally { await browser.close(); srv.close() }
})().catch(e => { console.error(e); process.exit(1) })
