#!/usr/bin/env node
// The REAL customer order page (app/trucks/[slug]/order/page.tsx), server-rendered from a US fixture truck
// (the render kit's state patches, nothing reaches a database or the network), painted in WebKit with the
// app's compiled CSS at an iPhone 12 Pro Max's 428pt width @3x, scrolled to the same place as the GB shot,
// then framed with the GB capture's own iOS status bar (time repainted, 12-hour) and Safari bottom bar.
// Step 1 of the order screenshot (frame-order.cjs is step 2).
//   node order-us.cjs <workDir>  → <workDir>/order-web.png (1284x2460) and order-us.html
const fs = require('fs'); const path = require('path')
const { REPO, dirs, appCss, fontClasses, serve } = require('./common.cjs')
const { WORK } = dirs()
const sharp = require('sharp')
const kit = require('../_render-kit.cjs')({ cacheTag: 'us-screens-order' })
const GB = path.join(REPO, 'public/screenshots/customer-order.png')

async function photo(top) {   // the GB capture's own menu photos (Pizza Kitchen's fixture photos), 80pt @3x
  const b = await sharp(GB).extract({ left: 972, top: top + 3, width: 234, height: 234 }).png().toBuffer()
  return 'data:image/png;base64,' + b.toString('base64')
}

;(async () => {
  kit.setNow('2026-09-01T21:31:00Z'); kit.setDeviceTz('America/Chicago'); kit.setDeviceLocale('en-US')   // 4:31 PM in Chicago
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const M = await kit.bundle('order', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'isScrolled', 'activeCategory', 'noEvents'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const P = { supreme: await photo(669), ham: await photo(1107), marg: await photo(1527), pep: await photo(1965) }
  const USD = { currency: 'USD', locale: 'en-US' }
  const time = { timeZone: 'America/Chicago', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
  const truck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
    ordering_available: true, card_payments_ready: false, allergen_display_mode: 'per_dish', money: USD, time,
    phone: { phoneCountry: 'US', short_name: 'US', phone_example: '(201) 555-0123', phoneCheck: 'length' } }
  const it = (id, name, description, price, photo_url, sub, dietary = []) => ({ id, name, description, price, category: 'Pizza', subcategory_id: sub, available: true, photo_url, dietary, allergens: [], modifierGroups: [] })
  const items = [
    it('p1', 'Margherita', 'Tomato sauce, fresh mozzarella, fresh basil, extra virgin olive oil. Simple and classic.', 12, P.marg, 's1', ['Vegetarian']),
    it('p2', 'Ham & Mushroom', 'Tomato sauce, mozzarella, ham, mushroom, extra virgin olive oil. A crowd favorite.', 14, P.ham, 's1'),
    it('p3', 'Supreme', 'Pepperoni, sausage, black olives, mozzarella, red sauce. Fully loaded.', 16, P.supreme, 's1'),
    it('p4', 'Pepperoni', 'Tomato sauce, mozzarella, pepperoni, hot honey. A spicy classic done right.', 15, P.pep, 's1'),
    it('p5', 'Garlic Knots', 'Six knots, garlic butter, parmesan, marinara for dipping.', 8, null, 's2', ['Vegetarian']),
    { id: 'd1', name: 'Cannoli', description: 'Two crisp shells, sweet ricotta, chocolate chips.', price: 6, category: 'Desserts', available: true, dietary: ['Vegetarian'], allergens: [], modifierGroups: [] },
    { id: 'k1', name: 'Coke', description: '12 oz can.', price: 2.5, category: 'Drinks', available: true, dietary: [], allergens: [], modifierGroups: [] },
  ]
  // The GB shot has Pizza first, then its "Specials" sub-category; the first item in its order is not shown.
  const menu = { categories: [{ id: 'c1', name: 'Pizza', subcategories: [{ id: 's1', name: 'Specials', sort_order: 1 }, { id: 's2', name: 'Sides', sort_order: 2 }] },
    { id: 'c2', name: 'Desserts' }, { id: 'c3', name: 'Drinks' }], items, upsell_rules: [], bundles: [] }
  const ev = { id: 'ev-1', date: '09/01/2026', date_iso: '2026-09-01', date_friendly: 'Tuesday, September 1', start_time: '16:00', end_time: '20:00',
    venue_name: 'Riverside Park', village: 'Springfield', notes: '', status: 'open', collection_interval_mins: 10 }
  const state = { truck, menu, events: [ev], event: ev, eventLoading: false, loading: false, noEvents: false, isScrolled: true, activeCategory: 'Pizza',
    basket: [{ menuItem: items[4], quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k-knots' }], appliedDeals: [] }
  globalThis.__ms = state
  let body
  try { body = kit.renderStatic(kit.h(M.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, kit.h(M.OrderPage, { params: { slug: 'test-kitchen' } }))) }
  finally { delete globalThis.__ms }
  body = body.replace(/<img alt="Village Foodie"[^>]*>/, '')
  const css = appCss()
  const page = () => `<!doctype html><html lang="en-US" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body class="${fontClasses(css)}">${body}</body></html>`
  fs.writeFileSync(path.join(WORK, 'order-us.html'), page())
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
    await pg.screenshot({ path: path.join(WORK, 'order-web.png') })
  } finally { await browser.close(); srv.close() }
})().catch(e => { console.error(e); process.exit(1) })
