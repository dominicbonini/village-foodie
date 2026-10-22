#!/usr/bin/env node
// AUSTRALIA / NEW ZEALAND version of order-ie.cjs. The REAL customer order page (app/trucks/[slug]/order/page.tsx), server-rendered
// from an AU or NZ fixture truck (anz-fixtures.cjs; the render kit's state patches, nothing reaches a database or the network),
// painted in WebKit with the app's compiled CSS at an iPhone 12 Pro Max's 428pt width @3x, scrolled to the same place as the
// GB shot, then framed with the GB capture's own iOS status bar (clock repainted, 12-hour) and Safari bottom bar.
// Step 1 of the AU/NZ order screenshot (frame-order-anz.cjs is step 2).
//   node order-anz.cjs <au|nz> <workDir>  → <workDir>/order-web-<au|nz>.png (1284x2460) and order-<au|nz>.html
const fs = require('fs'); const path = require('path')
const A = require('./anz-fixtures.cjs')
const c = A.country()
const { REPO, dirs, appCss, fontClasses, serve } = require('./common.cjs')
const { WORK } = dirs()
const sharp = require('sharp')
const kit = require('../_render-kit.cjs')({ cacheTag: `anz-screens-order-${c.key}` })
const GB = path.join(REPO, 'public/screenshots/customer-order.png')

async function photo(top) {   // the GB capture's own menu photos (Pizza Kitchen's fixture photos), 80pt @3x
  const b = await sharp(GB).extract({ left: 972, top: top + 3, width: 234, height: 234 }).png().toBuffer()
  return 'data:image/png;base64,' + b.toString('base64')
}

;(async () => {
  const NOW = A.instant(c, '2026-09-01', '16:31')   // Tue 1 Sep, 4:31 pm local — the GB capture's clock (16:31), in 12-hour form
  kit.setNow(NOW); kit.setDeviceTz(c.timeZone); kit.setDeviceLocale(c.locale)
  console.log(c.key, 'now', NOW, A.clock(c, NOW))
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const M = await kit.bundle('order', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'isScrolled', 'activeCategory', 'noEvents'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const P = { supreme: await photo(669), ham: await photo(1107), marg: await photo(1527), pep: await photo(1965) }
  const truck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
    ordering_available: true, card_payments_ready: false, allergen_display_mode: 'per_dish', money: c.money, time: c.time, phone: c.phone }
  // c.n / c.cat / c.desc: the country's own names (France's tables); the English key itself for AU/NZ/CA.
  const $ = n => c.price[c.n(n)]
  const it = (id, name, description, photo_url, sub, dietary = []) => ({ id, name: c.n(name), description: c.desc(name, description), price: $(name), category: c.cat('Pizza'), subcategory_id: sub, available: true, photo_url, dietary, allergens: [], modifierGroups: [] })
  const items = [
    it('p1', 'Margherita', 'Tomato sauce, fresh mozzarella, fresh basil, extra virgin olive oil. Simple and classic.', P.marg, 's1', ['Vegetarian']),
    it('p2', 'Ham & Mushroom', 'Tomato sauce, mozzarella, ham, mushroom, extra virgin olive oil. A crowd favourite.', P.ham, 's1'),
    it('p3', 'Supreme', 'Pepperoni, sausage, black olives, mozzarella, tomato sauce. Fully loaded.', P.supreme, 's1'),
    it('p4', 'Pepperoni', 'Tomato sauce, mozzarella, pepperoni, hot honey. A spicy classic done right.', P.pep, 's1'),
    it('p5', 'Garlic Bread', 'Stone-baked flatbread, garlic butter, mozzarella, parsley.', null, 's2', ['Vegetarian']),
    { id: 'd1', name: c.n('Tiramisu'), description: c.desc('Tiramisu', 'Mascarpone, espresso-soaked sponge, cocoa.'), price: $('Tiramisu'), category: c.cat('Desserts'), available: true, dietary: ['Vegetarian'], allergens: [], modifierGroups: [] },
    { id: 'k1', name: c.n('Coke'), description: c.can, price: $('Coke'), category: c.cat('Drinks'), available: true, dietary: [], allergens: [], modifierGroups: [] },
  ]
  // The GB shot has Pizza first, then its "Specials" sub-category; the first item in its order is not shown.
  const menu = { categories: [{ id: 'c1', name: c.cat('Pizza'), subcategories: [{ id: 's1', name: c.cat('Specials'), sort_order: 1 }, { id: 's2', name: c.cat('Sides'), sort_order: 2 }] },
    { id: 'c2', name: c.cat('Desserts') }, { id: 'c3', name: c.cat('Drinks') }], items, upsell_rules: [], bundles: [] }
  const ev = { id: 'ev-1', date: c.eventDate.date, date_iso: '2026-09-01', date_friendly: c.eventDate.friendly, start_time: '16:00', end_time: '20:00',
    venue_name: c.venue, village: c.town, notes: '', status: 'open', collection_interval_mins: 10 }
  const state = { truck, menu, events: [ev], event: ev, eventLoading: false, loading: false, noEvents: false, isScrolled: true, activeCategory: c.cat('Pizza'),
    basket: [{ menuItem: items[4], quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k-garlic' }], appliedDeals: [] }
  globalThis.__ms = state
  let body
  try { body = kit.renderStatic(kit.h(M.I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, kit.h(M.OrderPage, { params: { slug: 'test-kitchen' } }))) }
  finally { delete globalThis.__ms }
  body = body.replace(/<img alt="Village Foodie"[^>]*>/, '')
  const css = appCss()
  const page = () => `<!doctype html><html lang="${c.locale}" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body class="${fontClasses(css)}">${body}</body></html>`
  fs.writeFileSync(path.join(WORK, `order-${c.key}.html`), page())
  const srv = await serve(page)
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const WEB_H = 820   // 2601px − 141px of the GB capture, @3x: the web view between iOS's status bar and Safari's bar
    const pg = await browser.newPage({ viewport: { width: 428, height: WEB_H }, deviceScaleFactor: 3 })
    await pg.goto(srv.url, { waitUntil: 'load' })
    await pg.evaluate(() => document.fonts.ready)
    const m = await pg.evaluate(([SPECIALS, DESCS]) => {
      const h = [...document.querySelectorAll('p')].find(p => p.textContent.trim().toUpperCase().startsWith(SPECIALS))
      const group = h.parentElement
      window.scrollTo(0, group.getBoundingClientRect().top + window.scrollY - parseFloat(h.style.top || '121'))
      const footer = document.querySelector('.fixed.bottom-0')
      const lines = [...document.querySelectorAll('p')].filter(p => DESCS.includes(p.textContent.trim())).map(p => Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)))
      return { lines, top: h.style.top, footerTop: footer.getBoundingClientRect().top, scrollY: window.scrollY, overflowX: document.documentElement.scrollWidth - innerWidth }
    }, [c.cat('Specials').toUpperCase(), items.slice(0, 4).map(i => i.description)])
    console.log('order measure', m)
    await pg.waitForTimeout(200)
    await pg.screenshot({ path: path.join(WORK, `order-web-${c.key}.png`) })
  } finally { await browser.close(); srv.close() }
})().catch(e => { console.error(e); process.exit(1) })
