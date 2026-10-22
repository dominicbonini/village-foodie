// scripts/canada-1-screens.cjs — the screenshots for docs/canada-1-report.md (22 October 2026). NOT A SWEPT HARNESS: it needs a
// completed `next build` (the production CSS in .next/static) and Playwright's WebKit and Chromium, and it WRITES docs/canada-1/.
// Run by hand after a build:   node scripts/canada-1-screens.cjs
// Every view is a fixture render (scripts/_canada-1-fixtures.cjs — the CA row parsed from the NOT RUN SQL, switched ON here
// only), painted with the build's stylesheets, at 390 and 1440 in both engines:
//   /ca landing (pricing section), /ca/features (top), /ca/compare (top), the plans PDF (A4, and a printed PDF);
//   the order page's checkout for an Ontario, British Columbia, Alberta and Saskatchewan truck (HST 13% / GST 5% / GST 5% /
//   GST + PST 11%); the order card the dashboard and KDS show (Ontario); Manage › Payments › Tax for an Ontario truck.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'canada-1-screens' })
const { REPO, h } = kit
const CF = require('./_canada-1-fixtures.cjs')
const LP1E = require('./_lp1e-fixtures.cjs')
const { webkit, chromium } = require(path.join(REPO, 'node_modules/playwright'))

const OUT = path.join(REPO, 'docs/canada-1')
const cssDir = fs.existsSync(path.join(REPO, '.next/static/css')) ? path.join(REPO, '.next/static/css') : path.join(REPO, '.next/static/chunks')
const css = fs.readdirSync(cssDir).filter(f => f.endsWith('.css')).sort().map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n')
// ⚠️ SCREENSHOT-ONLY: the landing nav is sticky; a section shot further down would have it painted across its top.
const shell = (body, pad = '') => `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>.hg-landing nav { position: static !important; }</style></head><body${pad ? ` style="${pad}"` : ''}>${body}</body></html>`

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const R = CF.renderer(kit, 'ca1s')
  const rows = CF.ROWS.caOn()
  const CA = await R.rowOf(rows, 'CA')
  const docs = {}
  for (const p of ['landing', 'features', 'compare']) docs[`ca-${p}`] = { html: shell((await R.page(p, 'ca', rows)).html), region: p }
  docs['ca-pdf'] = { html: await R.pdf(rows, 'CA'), region: 'pdf' }

  // The order page's checkout, per province — the real page with its states patched (scripts/canada-1.cjs §4 does the same).
  const ENG = await kit.bundle('ca1s-engine', "export * as E from '@/lib/order-charges'\nexport * as R from '@/lib/order-charge-rules'")
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const page = await kit.bundle('ca1s-orderpage', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'formSheetOpen', 'payByCard', 'tipSel', 'tipOther',
      'summaryExpanded', 'sheetSummaryExpanded', 'name', 'email'] }, { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const CAD = { currency: 'CAD', locale: 'en-CA' }
  const TIME = { timeZone: 'America/Toronto', locale: 'en-CA', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
  const pizza = { id: 'p1', name: 'Margherita', price: 12, category: 'Pizza', available: true, modifierGroups: [], allergens: ['Milk', 'Wheat and triticale', 'Mustard'], dietary: ['Vegetarian'] }
  const EV = { id: 'ev-1', date: '10/09/2026', date_iso: '2026-10-09', date_friendly: 'Friday, October 9', start_time: '17:00', end_time: '21:00', venue_name: 'Trinity Bellwoods Park', village: 'Toronto', notes: '', status: 'open', collection_interval_mins: 10 }
  for (const rg of ['ON', 'BC', 'AB', 'SK']) {
    const rules = ENG.R.resolveChargeRules(CA, { country: 'CA', base_region_code: rg })
    const truck = { id: 'ca-fixture', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro', ordering_available: true,
      card_payments_ready: true, money: CAD, phone: { phoneCountry: 'CA', short_name: 'Canada', phone_example: '416-555-0123', phoneCheck: 'length' }, time: TIME, allergen_display_mode: 'per_dish',
      checkout: ENG.E.checkoutRulesFrom(rules) }
    globalThis.__ms = { truck, menu: { categories: [{ id: 'c1', name: 'Pizza' }], items: [pizza], upsell_rules: [], bundles: [] }, events: [EV], event: EV, eventLoading: false, loading: false,
      basket: [{ menuItem: pizza, quantity: 2, modifiers: [], specialInstructions: '', cartKey: 'k1' }], appliedDeals: [], formSheetOpen: true, sheetSummaryExpanded: true,
      summaryExpanded: true, name: 'Ann', email: 'ann@example.test', payByCard: true, tipSel: 1500 }
    try { docs[`ca-checkout-${rg.toLowerCase()}`] = { html: shell(kit.renderStatic(h(page.I18nContext.Provider, { value: { locale: 'en-CA', setLocale() {} } }, h(page.OrderPage, { params: { slug: 'ca-fixture' } })))), region: 'checkout' } }
    finally { delete globalThis.__ms }
  }
  // The order card (dashboard and KDS), Ontario, with its charge rows open.
  const cards = await kit.bundle('ca1s-cards', "export * from '@/components/dashboard/OrderCard'\nexport { MoneyProvider } from '@/components/MoneyContext'\nexport { I18nContext } from '@/lib/i18n/use-t'", { patches: [{ file: 'components/dashboard/OrderCard.tsx', states: ['chargesOpen'] }] })
  const snap = ENG.E.computeOrderCharges({ foodMinor: 2400, rules: ENG.R.resolveChargeRules(CA, { country: 'CA', base_region_code: 'ON' }), channel: 'online_pay_at_truck' }).snapshot
  globalThis.__ms = { chargesOpen: true }
  try {
    docs['ca-order-card-on'] = { html: shell(kit.renderStatic(h(cards.I18nContext.Provider, { value: { locale: 'en-CA', setLocale() {} } }, h(cards.MoneyProvider, { fmt: CAD }, h(cards.OrderCard, { order: { id: '41', order_key: 'ok-1', customer_name: 'Ann', customer_phone: null, customer_email: 'ann@example.test',
      slot: '12:30', event_date: '2026-10-09', event_id: 'ev-1', status: 'confirmed', items: [{ name: 'Margherita', quantity: 2, unit_price: 12, modifiers: [] }], deals: [], total: 27.12, total_minor: 2712,
      currency: 'CAD', country: 'CA', created_at: '2026-10-09T16:00:00Z', payment_status: 'unpaid', ...snap }, onAction() {}, onStatusChange() {}, time: TIME, truck: { time: TIME, money: CAD } })))), 'padding:16px;max-width:520px'), region: 'card' }
  } finally { delete globalThis.__ms }
  // Manage › Payments › Tax, an Ontario truck with no rate of its own.
  const CC = await LP1E.context(kit, REPO).bundle('ca1s-charges', "export { ChargesCard } from '@/components/manage/ChargesCard'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\nexport { I18nContext } from '@/lib/i18n/use-t'")
  docs['ca-manage-tax-on'] = { html: shell(kit.renderStatic(h(CC.I18nContext.Provider, { value: { locale: 'en-CA', setLocale() {} } }, h(CC.CountrySettingsProvider, { value: CA, settings: CA },
    h(CC.ChargesCard, { truck: { base_region_code: 'ON', tax_rate_milli: null }, api: async () => null, showToast() {}, onTruckUpdate() {} })))), 'padding:16px;max-width:620px;background:#f8fafc'), region: 'card' }

  const report = []
  for (const [engineName, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch()
    for (const [key, d] of Object.entries(docs)) {
      for (const w of d.region === 'pdf' ? [794] : [390, 1440]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
        const pg = await ctx.newPage()
        await pg.setContent(d.html, { waitUntil: 'load' })
        const file = path.join(OUT, `${engineName}-${key}-${w}.png`)
        if (d.region === 'landing') await pg.locator('#pricing').first().screenshot({ path: file })
        else if (d.region === 'features' || d.region === 'compare') {
          const box = await pg.evaluate(max => ({ x: 0, y: 0, width: document.documentElement.clientWidth, height: Math.min(document.documentElement.scrollHeight, max) }), d.region === 'features' ? 1500 : 1100)
          await pg.screenshot({ path: file, clip: box, fullPage: true })
        } else if (d.region === 'checkout') {
          // the basket sheet: from the basket heading to Place order
          const box = await pg.evaluate(() => {
            const all = [...document.querySelectorAll('body *')]
            const from = all.find(e => /Your order|Your basket|Basket/.test(e.textContent || '') && e.children.length < 4) || document.body
            const notice = document.querySelector('[data-tax-notice]')
            const top = Math.max(0, (notice ? notice.getBoundingClientRect().top : from.getBoundingClientRect().top) + scrollY - 140)
            const place = all.filter(e => /Place order/.test(e.textContent || '') && e.children.length === 0).pop()
            const bottom = (place ? place.getBoundingClientRect().bottom + scrollY + 24 : top + 1200)
            return { x: 0, y: top, width: document.documentElement.clientWidth, height: Math.min(bottom - top, 1800) }
          })
          await pg.screenshot({ path: file, clip: box, fullPage: true })
        } else await pg.screenshot({ path: file, fullPage: true })
        const m = await pg.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 4000), scrollW: document.documentElement.scrollWidth }))
        report.push({ file: path.basename(file), engine: engineName, width: w, scrollW: m.scrollW,
          line: (m.text.match(/Prices in Canadian dollars \(CAD\)/) || [])[0] ?? null,
          tax: (m.text.match(/(HST|GST \+ PST|GST) \d+%\s*\$\d+\.\d\d/) || [])[0] ?? null,
          total: (m.text.match(/Total\s*\$\d+\.\d\d/) || [])[0] ?? null,
          regionDefault: (m.text.match(/Leave it empty to charge [^.]*\./) || [])[0] ?? null })
        await ctx.close()
      }
    }
    await browser.close()
  }
  const ch = await chromium.launch(); const pg = await ch.newPage()
  await pg.setContent(docs['ca-pdf'].html, { waitUntil: 'load' }); await pg.pdf({ path: path.join(OUT, 'plans-ca.pdf'), format: 'A4', printBackground: true }); await ch.close()
  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(report, null, 1) + '\n')
  for (const r of report) console.log(`${r.file.padEnd(44)} scrollW=${r.scrollW} line=${!!r.line} tax=${JSON.stringify(r.tax)} total=${JSON.stringify(r.total)} default=${JSON.stringify(r.regionDefault)}`)
})().catch(e => { console.error(e); process.exit(1) })
