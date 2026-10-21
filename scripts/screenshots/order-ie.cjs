#!/usr/bin/env node
// IRELAND version of order-us.cjs. The REAL customer order page (app/trucks/[slug]/order/page.tsx), server-rendered from an IE fixture truck
// (the render kit's state patches, nothing reaches a database or the network), painted in WebKit with the
// app's compiled CSS at an iPhone 12 Pro Max's 428pt width @3x, scrolled to the same place as the GB shot,
// then framed with the GB capture's own iOS status bar (clock kept as captured: 16:31, 24-hour) and Safari bottom bar.
// Step 1 of the IE order screenshot (frame-order-ie.cjs is step 2).
//   node order-ie.cjs <workDir>  → <workDir>/order-web-ie.png (1284x2460) and order-ie.html
const fs = require('fs'); const path = require('path')
const { REPO, dirs, appCss, fontClasses, serve } = require('./common.cjs')
const { WORK } = dirs()
const sharp = require('sharp')
const kit = require('../_render-kit.cjs')({ cacheTag: 'ie-screens-order' })
const GB = path.join(REPO, 'public/screenshots/customer-order.png')

async function photo(top) {   // the GB capture's own menu photos (Pizza Kitchen's fixture photos), 80pt @3x
  const b = await sharp(GB).extract({ left: 972, top: top + 3, width: 234, height: 234 }).png().toBuffer()
  return 'data:image/png;base64,' + b.toString('base64')
}

;(async () => {
  kit.setNow('2026-09-01T15:31:00Z'); kit.setDeviceTz('Europe/Dublin'); kit.setDeviceLocale('en-IE')   // Tue 1 Sep, 16:31 in Dublin (IST, UTC+1) — the GB capture's clock
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const M = await kit.bundle('order', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'isScrolled', 'activeCategory', 'noEvents'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const P = { supreme: await photo(669), ham: await photo(1107), marg: await photo(1527), pep: await photo(1965) }
  const EUR = { currency: 'EUR', locale: 'en-IE' }
  const time = { timeZone: 'Europe/Dublin', locale: 'en-IE', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
  const truck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
    ordering_available: true, card_payments_ready: false, allergen_display_mode: 'per_dish', money: EUR, time,
    phone: { phoneCountry: 'IE', short_name: 'Ireland', phone_example: '085 123 4567', phoneCheck: 'length' } }
  const it = (id, name, description, price, photo_url, sub, dietary = []) => ({ id, name, description, price, category: 'Pizza', subcategory_id: sub, available: true, photo_url, dietary, allergens: [], modifierGroups: [] })
  const items = [
    it('p1', 'Margherita', 'Tomato sauce, fresh mozzarella, fresh basil, extra virgin olive oil. Simple and classic.', 12, P.marg, 's1', ['Vegetarian']),
    it('p2', 'Ham & Mushroom', 'Tomato sauce, mozzarella, ham, mushroom, extra virgin olive oil. A crowd favourite.', 14, P.ham, 's1'),
    it('p3', 'Supreme', 'Pepperoni, sausage, black olives, mozzarella, tomato sauce. Fully loaded.', 16, P.supreme, 's1'),
    it('p4', 'Pepperoni', 'Tomato sauce, mozzarella, pepperoni, hot honey. A spicy classic done right.', 15, P.pep, 's1'),
    it('p5', 'Garlic Bread', 'Stone-baked flatbread, garlic butter, mozzarella, parsley.', 6, null, 's2', ['Vegetarian']),
    { id: 'd1', name: 'Tiramisu', description: 'Mascarpone, espresso-soaked sponge, cocoa.', price: 6, category: 'Desserts', available: true, dietary: ['Vegetarian'], allergens: [], modifierGroups: [] },
    { id: 'k1', name: 'Coke', description: '330ml can.', price: 2.5, category: 'Drinks', available: true, dietary: [], allergens: [], modifierGroups: [] },
  ]
  // The GB shot has Pizza first, then its "Specials" sub-category; the first item in its order is not shown.
  const menu = { categories: [{ id: 'c1', name: 'Pizza', subcategories: [{ id: 's1', name: 'Specials', sort_order: 1 }, { id: 's2', name: 'Sides', sort_order: 2 }] },
    { id: 'c2', name: 'Desserts' }, { id: 'c3', name: 'Drinks' }], items, upsell_rules: [], bundles: [] }
  const ev = { id: 'ev-1', date: '01/09/2026', date_iso: '2026-09-01', date_friendly: 'Tuesday 1 September', start_time: '16:00', end_time: '20:00',
    venue_name: "People's Park", village: 'Limerick', notes: '', status: 'open', collection_interval_mins: 10 }
  const state = { truck, menu, events: [ev], event: ev, eventLoading: false, loading: false, noEvents: false, isScrolled: true, activeCategory: 'Pizza',
    basket: [{ menuItem: items[4], quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k-garlic' }], appliedDeals: [] }
  globalThis.__ms = state
  let body
  try { body = kit.renderStatic(kit.h(M.I18nContext.Provider, { value: { locale: 'en-IE', setLocale() {} } }, kit.h(M.OrderPage, { params: { slug: 'test-kitchen' } }))) }
  finally { delete globalThis.__ms }
  body = body.replace(/<img alt="Village Foodie"[^>]*>/, '')
  const css = appCss()
  const page = () => `<!doctype html><html lang="en-IE" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body class="${fontClasses(css)}">${body}</body></html>`
  fs.writeFileSync(path.join(WORK, 'order-ie.html'), page())
  const srv = await serve(page)
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const WEB_H = 820   // 2601px − 141px of the GB capture, @3x: the web view between iOS's status bar and Safari's bar
    const pg = await browser.newPage({ viewport: { width: 428, height: WEB_H }, deviceScaleFactor: 3 })
    await pg.goto(srv.url, { waitUntil: 'load' })
    await pg.evaluate(() => document.fonts.ready)
    const m = await pg.evaluate(() => {
      const h = [...document.querySelectorAll('p')].find(p => p.textContent.trim().toUpperCase().startsWith('SPECIALS'))
      const group = h.parentElement
      window.scrollTo(0, group.getBoundingClientRect().top + window.scrollY - parseFloat(h.style.top || '121'))
      const footer = document.querySelector('.fixed.bottom-0')
      const lines = [...document.querySelectorAll('p')].filter(p => /Tomato sauce|Pepperoni, sausage/.test(p.textContent)).map(p => Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)))
      return { lines, top: h.style.top, footerTop: footer.getBoundingClientRect().top, scrollY: window.scrollY, overflowX: document.documentElement.scrollWidth - innerWidth }
    })
    console.log('order measure', m)
    await pg.waitForTimeout(200)
    await pg.screenshot({ path: path.join(WORK, 'order-web-ie.png') })
  } finally { await browser.close(); srv.close() }
})().catch(e => { console.error(e); process.exit(1) })
