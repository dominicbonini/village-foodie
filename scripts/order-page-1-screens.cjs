// scripts/order-page-1-screens.cjs — the screenshots and measurements for docs/order-page-1-report.md (13 November 2026). NOT A SWEPT
// HARNESS: it needs a completed `next build` (the production CSS in .next/static) and Playwright's WebKit and Chromium, and it WRITES
// docs/order-page-1/. Run by hand after a build:   node scripts/order-page-1-screens.cjs
//
// Every view is the REAL order page (app/(app)/trucks/[slug]/order/page.tsx) rendered with its state patched to FIXTURE data — a
// made-up truck, menu, formules and events, never a live truck — and painted with the build's stylesheets in a browser, the
// canada-1-screens.cjs method. Sticky positioning is CSS, so the scrolled shots show the tabs pinned as a phone would.
//   fr-formules       a French truck WITH formules, two events (so "Changer d’événement →" shows), one formule already added
//   fr-no-formules    the same truck with none — the menu starts with its first category, as before
//   de-long, fi-long  a long venue name and area in German and Finnish, at 320 and 390
//   fr-chooser        /trucks/<slug>/order with no event — the page "Change event" now opens
// Measured on every shot: no sideways scroll; the event box's three lines in order and not overlapping; the full venue name and
// area present and not clipped; the change-event link's href; FORMULES first; the menu full-bleed on a phone and capped on desktop.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'order-page-1-screens' })
const { REPO, h } = kit
const { webkit, chromium } = require(path.join(REPO, 'node_modules/playwright'))

const OUT = path.join(REPO, 'docs/order-page-1')
const cssDir = fs.existsSync(path.join(REPO, '.next/static/css')) ? path.join(REPO, '.next/static/css') : path.join(REPO, '.next/static/chunks')
const css = fs.readdirSync(cssDir).filter(f => f.endsWith('.css')).sort().map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n')
const shell = (body, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="bg-slate-50">${body}</body></html>`

const OP = 'app/(app)/trucks/[slug]/order/page.tsx'
const SLUG = 'camion-test'
const TIME = { fr: { timeZone: 'Europe/Paris', locale: 'fr-FR', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' },
  de: { timeZone: 'Europe/Berlin', locale: 'de-DE', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' },
  fi: { timeZone: 'Europe/Helsinki', locale: 'fi-FI', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' } }
const LOCALE = { fr: 'fr-FR', de: 'de-DE', fi: 'fi-FI' }
const truckOf = (cc, l) => ({ id: 'fixture-truck', name: 'Camion Test', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
  ordering_available: true, card_payments_ready: false, allergen_display_mode: 'per_dish', extra_wait_mins: 0,
  money: { currency: 'EUR', locale: LOCALE[l] }, time: TIME[l], phone: { phoneCountry: cc, short_name: cc, phone_example: '06 12 34 56 78', phoneCheck: 'length' } })
const item = (name, price, category, description) => ({ name, description, price, category, available: true, dietary: [], allergens: [], modifierGroups: [] })
const ITEMS = [
  item('Margherita', 10, 'Pizzas', 'Tomate, mozzarella, basilic.'), item('Regina', 12, 'Pizzas', 'Tomate, mozzarella, jambon, champignons.'),
  item('Quatre fromages', 13, 'Pizzas', 'Mozzarella, gorgonzola, chèvre, parmesan.'), item('Calzone', 13, 'Pizzas', 'Jambon, œuf, mozzarella.'),
  item('Tiramisu', 5, 'Desserts', 'Maison.'), item('Panna cotta', 4.5, 'Desserts', 'Coulis de fruits rouges.'),
  item('Limonade', 3, 'Boissons', 'Artisanale, 33 cl.'), item('Eau pétillante', 2, 'Boissons', '50 cl.'),
]
const CATS = [{ id: 'c1', name: 'Pizzas', prep_secs: 600, batch_size: 4 }, { id: 'c2', name: 'Desserts', prep_secs: 0 }, { id: 'c3', name: 'Boissons', prep_secs: 0 }]
const bundle = (name, description, bundle_price, original_price, s1, s2, s3) => ({ name, description, bundle_price, original_price, available: true, start_time: null, end_time: null,
  slot_1_category: s1, slot_2_category: s2, slot_3_category: s3 ?? null, slot_4_category: null, slot_5_category: null, slot_6_category: null })
const BUNDLES = [bundle('Formule midi', 'Une pizza au choix et une boisson.', 13, 15, 'Pizzas', 'Boissons'),
  bundle('Formule complète', 'Une pizza, un dessert et une boisson.', 17, 20, 'Pizzas', 'Desserts', 'Boissons')]
const ev = (id, dd, iso, venue, village, postcode) => ({ id, date: dd, date_iso: iso, date_friendly: '', start_time: '19:00', end_time: '21:15', venue_name: venue, village, postcode, notes: '', status: 'open', collection_interval_mins: 15, is_private: false })
const EV_FR = ev('ev-1', '13/11/2026', '2026-11-13', 'Place du Marché', 'Lyon', '69002')
const EV_FR2 = ev('ev-2', '20/11/2026', '2026-11-20', 'Parc de la Tête d’Or', 'Lyon', '69006')
const EV_DE = ev('ev-1', '13/11/2026', '2026-11-13', 'Wochenmarkt auf dem Rathausplatz der Gemeinde Garmisch-Partenkirchen (Haupteingang Nord, neben der Tourist-Information)', 'Garmisch-Partenkirchen', '82467')
const EV_FI = ev('ev-1', '13/11/2026', '2026-11-13', 'Kauppatori, Pohjoisesplanadin ja Eteläesplanadin välinen ruokarekkapaikka (Kolera-altaan puoleinen pää)', 'Helsinki', '00170')

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const P = await kit.bundle('op1s-orderpage', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'noEvents', 'availableSlots', 'activeCategory'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const render = (l, cc, state) => {
    globalThis.__ms = { truck: truckOf(cc, l), events: [], eventLoading: false, loading: false, noEvents: false, basket: [], appliedDeals: [], availableSlots: [], ...state }
    try { return shell(kit.renderStatic(h(P.I18nContext.Provider, { value: { locale: LOCALE[l], setLocale() {} } }, h(P.OrderPage, { params: { slug: SLUG } }))), LOCALE[l]) }
    finally { delete globalThis.__ms }
  }
  const withFormules = { categories: CATS, items: ITEMS, upsell_rules: [], bundles: BUNDLES }
  const noFormules = { categories: CATS, items: ITEMS, upsell_rules: [], bundles: [] }
  const added = { bundle: BUNDLES[0], slots: { Pizzas: 'Margherita', Boissons: 'Limonade' }, itemsTakenFromBasket: [], modifierExtra: 0, slotModifiers: {}, slotNotes: {} }
  const docs = {
    'fr-formules': { html: render('fr', 'FR', { menu: withFormules, events: [EV_FR, EV_FR2], event: EV_FR, appliedDeals: [added] }), widths: [390, 1440], scrolled: true },
    // the scrolled shot: the spy would light "Pizzas" by then — a static render cannot run it, so the state is set as it would be
    'fr-formules-pizzas': { html: render('fr', 'FR', { menu: withFormules, events: [EV_FR, EV_FR2], event: EV_FR, appliedDeals: [added], activeCategory: 'Pizzas' }), widths: [390], scrollTo: 'Pizzas' },
    'fr-no-formules': { html: render('fr', 'FR', { menu: noFormules, events: [EV_FR, EV_FR2], event: EV_FR }), widths: [390, 1440], scrolled: true },
    'de-long': { html: render('de', 'DE', { menu: withFormules, events: [EV_DE, { ...EV_DE, id: 'ev-2', date: '20/11/2026', date_iso: '2026-11-20' }], event: EV_DE }), widths: [320, 390] },
    'fi-long': { html: render('fi', 'FI', { menu: withFormules, events: [EV_FI, { ...EV_FI, id: 'ev-2', date: '20/11/2026', date_iso: '2026-11-20' }], event: EV_FI }), widths: [320, 390] },
    'fr-chooser': { html: render('fr', 'FR', { menu: withFormules, events: [EV_FR, EV_FR2], event: null }), widths: [390] },
  }
  const report = []
  let bad = 0
  const fail = (msg) => { bad++; console.log('  🔴 ' + msg) }
  for (const [engineName, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch()
    for (const [key, d] of Object.entries(docs)) {
      for (const w of d.widths) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2 })
        const pg = await ctx.newPage()
        await pg.setContent(d.html, { waitUntil: 'load' })
        const m = await pg.evaluate(() => {
          const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY, left: b.left, right: b.right, width: b.width } }
          const box = document.querySelector('[data-event-box]')
          const lines = box ? [...box.children].map(r) : []
          const loc = box ? box.children[1] : null
          const clipped = loc ? [...loc.querySelectorAll('span')].some(s => s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1) : null
          const menu = document.querySelector('[data-menu]')
          const chips = [...document.querySelectorAll('[data-menu] .sticky.z-30 button')].map(b => b.innerText.trim())
          const firstSection = document.querySelector('[data-menu] [data-formules], [data-menu] .mb-4.last\\:mb-0')
          // the event box's third line holds the link (the render kit's next/link stand-in keeps only href and class, so the
          // data-change-event marker the real page carries is not in this static render)
          const link = box && box.children[2] ? box.children[2].querySelector('a') : null
          return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, lines, clipped,
            locText: loc ? loc.innerText.replace(/\s+/g, ' ').trim() : null, linkHref: link ? link.getAttribute('href') : null, linkText: link ? link.innerText.trim() : null,
            menu: r(menu), chips, formulesFirst: !!(firstSection && firstSection.hasAttribute('data-formules')), formules: document.querySelectorAll('[data-formule]').length,
            cardsAbove: !!document.querySelector('main > .mb-4 > h2'), chooser: !!document.querySelector('main') && /Choisissez|chooseEvent/i.test(document.body.innerText) }
        })
        const tag = `${engineName} ${key} @${w}`
        if (m.scrollW > m.clientW) fail(`${tag}: the page scrolls sideways (${m.scrollW} > ${m.clientW})`)
        if (key !== 'fr-chooser') {
          if (m.lines.length < 2) fail(`${tag}: the event box has ${m.lines.length} lines`)
          for (let i = 1; i < m.lines.length; i++) if (m.lines[i].top < m.lines[i - 1].bottom - 0.5) fail(`${tag}: event-box line ${i + 1} overlaps line ${i}`)
          if (m.clipped) fail(`${tag}: the location is clipped`)
          if (m.linkHref !== `/trucks/${'camion-test'}/order`) fail(`${tag}: change-event href is ${m.linkHref}`)
          if (w < 640 && (Math.round(m.menu.left) !== 0 || Math.round(m.menu.width) !== w)) fail(`${tag}: the menu is not full width on a phone (${m.menu.left}, ${m.menu.width})`)
          if (w >= 640 && m.menu.width > 512 + 1) fail(`${tag}: the menu is wider than today's maximum (${m.menu.width})`)
          const hasF = /formules|long/.test(key) && !/no-formules/.test(key)
          if (hasF && (!m.formulesFirst || m.formules !== 2)) fail(`${tag}: formules are not the first section (${m.formulesFirst}, ${m.formules})`)
          if (!hasF && m.formules !== 0) fail(`${tag}: formules shown with none`)
          if (m.cardsAbove) fail(`${tag}: a deals card sits above the menu`)
        }
        const base = path.join(OUT, `${engineName}-${key}-${w}`)
        await pg.screenshot({ path: `${base}-top.png` })
        if (d.scrolled || d.scrollTo) {
          const target = d.scrollTo
          const pinned = await pg.evaluate(t => {
            const sections = [...document.querySelectorAll('[data-menu] [data-formules], [data-menu] .mb-4.last\\:mb-0')]
            const el = t ? sections.find(s => (s.querySelector('p') || {}).innerText?.toLowerCase().includes(t.toLowerCase())) : sections[0]
            const y = (el ? el.getBoundingClientRect().top + scrollY : 900) - 120 + (t ? 180 : 260)
            window.scrollTo(0, y)
            const bar = document.querySelector('[data-menu] .sticky.z-30')
            return bar ? { top: Math.round(bar.getBoundingClientRect().top), want: parseInt(bar.style.top, 10) } : null
          }, target ?? null)
          await pg.waitForTimeout(80)
          await pg.screenshot({ path: `${base}-scrolled.png` })
          if (!pinned || pinned.top !== pinned.want) fail(`${tag}: the tab bar is not pinned under the header when scrolled (${JSON.stringify(pinned)})`)
          m.pinned = pinned
        }
        report.push({ shot: path.basename(base), ...m })
        console.log(`  ✓ ${tag}: lines=${m.lines.length} chips=[${m.chips.join(' | ')}] link=${m.linkHref} "${m.linkText}" loc="${(m.locText || '').slice(0, 70)}…" menu=${Math.round(m.menu?.left ?? -1)}+${Math.round(m.menu?.width ?? 0)}${m.pinned ? ` pinned=${m.pinned.top}/${m.pinned.want}` : ''}`)
        await ctx.close()
      }
    }
    await browser.close()
  }
  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(report, null, 1) + '\n')
  console.log(`\n${bad ? '🔴 ' + bad + ' problem(s)' : '✅ order-page-1-screens: every view measured clean'} — ${report.length} shots in docs/order-page-1/`)
  process.exit(bad ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
