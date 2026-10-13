#!/usr/bin/env node
// scripts/phase3-screens-shots.cjs — Phase 3 screens in a real browser (docs/phase-3-screens-report.md).
//   node scripts/phase3-screens-shots.cjs     (needs `npx next build` for the app CSS, and local Chromium)
//
// The REAL components are rendered from fixtures (the same state-patching method as
// scripts/money-sweep-parity.cjs — the page starts in a given state, nothing reaches a database or the
// network), and the markup is loaded into Chromium with the app's own compiled CSS. US fixtures only; the US
// stays switched off in the database. Each shot is also measured, so the proofs are about what is ON SCREEN:
// the tip buttons' heights, the selected button's border and fill, and that nothing overflows at 390.
//
// Writes into docs/screenshots/:
//   phase3-order-{390,1440}-tip.png         the sheet, paying by card with a 15 % tip
//   phase3-order-{390,1440}-no-tip.png      the same, "No tip" (the default)
//   phase3-order-390-pay-at-truck.png       paying at the truck: no fee, no tip
//   phase3-payments-{1440,820}-truck.png    Manage › Payments, the truck keeps the service fee
//   phase3-payments-{1440,820}-hatchgrab.png  …HatchGrab keeps it
//   phase3-countries-1440-fee-rows.png      Admin › Countries, the new fee rows (GB and US columns)
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const OUT = path.join(REPO, 'docs/screenshots')
fs.mkdirSync(OUT, { recursive: true })
const kit = require('./_render-kit.cjs')({ cacheTag: 'phase3-shots' })
const SEEDS = require('./_country-settings-gb.cjs')
let failures = 0, checks = 0
const t = (name, cond, detail) => { checks++; if (cond) return; failures++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f) } }
  walk(root)
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  if (!css.includes('min-h-\\[44px\\]') || !css.includes('bg-blue-50')) throw new Error('the compiled CSS predates Phase 3 screens — run `npx next build`')
  return css
}

const USD = { currency: 'USD', locale: 'en-US' }
const el = (...a) => kit.h(...a)

async function main() {
  const css = appCss()
  const { chromium } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await chromium.launch()
  // ⚠️ `wholeSheet`: the order sheet is a fixed panel capped at 90vh with its own scroll, so a capture shows
  // only its top. For the SHOT ONLY, the cap is lifted (an injected rule, never the app's CSS) and the
  // viewport is captured, so the whole sheet — tip block, totals and button — is in one image.
  const shoot = async (html, file, width, height, measure, wholeSheet = false) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
    const lift = wholeSheet ? '<style>.max-h-\\[90vh\\]{max-height:none!important;overflow:visible!important}</style>' : ''
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>${lift}</head><body class="bg-slate-50">${html}</body></html>`)
    await page.waitForTimeout(150)
    const m = measure ? await page.evaluate(measure) : null
    await page.screenshot({ path: path.join(OUT, file), fullPage: !wholeSheet })
    await page.close()
    return m
  }

  // ── 1 · THE ORDER PAGE ──────────────────────────────────────────────────────────────────────────────
  const E = (await kit.bundle('shots-engine', "export * as E from '@/lib/order-charges'\nexport * as R from '@/lib/order-charge-rules'")).E
  const R = (await kit.bundle('shots-engine2', "export * as R from '@/lib/order-charge-rules'")).R
  const usC = { ...SEEDS.usFromSeed(), serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 }
  const CHECKOUT = E.checkoutRulesFrom(R.resolveChargeRules(usC, { country: 'US', tax_rate_milli: 8250, service_fee_enabled: true, service_fee_bps: 300, service_fee_fixed_minor: 30 }))
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const page = await kit.bundle('shots-orderpage', `export { default as OrderPage } from '@/${OP}'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'formSheetOpen', 'payByCard', 'tipSel', 'tipOther',
      'summaryExpanded', 'sheetSummaryExpanded', 'name', 'email'] }, { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const burger = { id: 'u1', name: 'Burger', price: 12, category: 'Mains', available: true, modifierGroups: [] }
  const ev = { id: 'ev-1', date: '09/10/2026', date_iso: '2026-10-09', date_friendly: 'Friday 9 October', start_time: '17:00', end_time: '21:00', venue_name: 'Zilker Park', village: 'Austin', notes: '', status: 'open', collection_interval_mins: 10 }
  const truck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro', ordering_available: true,
    card_payments_ready: true, money: USD, phone: { phoneCountry: 'US', short_name: 'US', phone_example: '(201) 555-0123', phoneCheck: 'length' },
    time: { timeZone: 'America/Chicago', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }, checkout: CHECKOUT }
  const st = over => ({ truck, menu: { categories: [{ id: 'c1', name: 'Mains' }], items: [burger], upsell_rules: [], bundles: [] }, events: [ev], event: ev, eventLoading: false, loading: false,
    basket: [{ menuItem: burger, quantity: 2, modifiers: [], specialInstructions: '', cartKey: 'k1' }], appliedDeals: [], formSheetOpen: true, sheetSummaryExpanded: true,
    name: 'Ann Example', email: 'ann@example.test', ...over })
  const html = state => { globalThis.__ms = state; try { return kit.renderStatic(el(page.OrderPage, { params: { slug: 'test-kitchen' } })) } finally { delete globalThis.__ms } }
  const measureTips = () => {
    const blk = document.querySelector('[data-tip-block]')
    const btns = blk ? [...blk.querySelectorAll('button')] : []
    const sel = btns.find(b => b.getAttribute('aria-pressed') === 'true')
    const cs = sel ? getComputedStyle(sel) : null
    // Tailwind v4 computes colours in lab(); compare against a reference element with the SAME classes.
    const ref = document.createElement('div'); ref.className = 'border-2 border-slate-900 bg-blue-50'; document.body.appendChild(ref)
    const rs = getComputedStyle(ref)
    const want = { border: `${rs.borderTopWidth} ${rs.borderTopColor}`, fill: rs.backgroundColor }
    ref.remove()
    return {
      want,
      heights: btns.map(b => Math.round(b.getBoundingClientRect().height)),
      widths: btns.map(b => Math.round(b.getBoundingClientRect().width)),
      selBorder: cs ? `${cs.borderTopWidth} ${cs.borderTopColor}` : null, selFill: cs ? cs.backgroundColor : null,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      totals: document.querySelector('[data-checkout-totals]')?.innerText ?? null,
    }
  }
  for (const w of [390, 1440]) {
    const tip = await shoot(html(st({ payByCard: true, tipSel: 1500 })), `phase3-order-${w}-tip.png`, w, 2200, measureTips, true)
    t(`order ${w}: four tip buttons and "Other" — five, all at least 44px tall and equal width`, tip.heights.length === 5 && tip.heights.every(x => x >= 44) && new Set(tip.widths).size === 1, tip)
    t(`order ${w}: the selected button is a 2px dark border (slate-900) on a pale blue fill (blue-50)`, tip.selBorder === tip.want.border && tip.selFill === tip.want.fill && tip.selBorder.startsWith('2px'), tip)
    t(`order ${w}: the totals box reads Subtotal $24.00 · Sales tax 8.25% $1.98 · Online service fee $1.02 · Tip 15% $3.60 · Total $30.60`,
      /Subtotal\s*\$24\.00\s*Sales tax\s*8\.25%\s*\$1\.98\s*Online service fee\s*\$1\.02\s*Tip\s*15%\s*\$3\.60\s*Total\s*\$30\.60/.test(tip.totals || ''), tip.totals)
    t(`order ${w}: nothing overflows sideways`, tip.overflow === false)
    const noTip = await shoot(html(st({ payByCard: true })), `phase3-order-${w}-no-tip.png`, w, 2200, measureTips, true)
    t(`order ${w}: "No tip" by default — Total $27.00`, /Total\s*\$27\.00/.test(noTip.totals || '') && !/Tip\s/.test(noTip.totals || ''), noTip.totals)
  }
  const hatch = await shoot(html(st({ payByCard: false })), 'phase3-order-390-pay-at-truck.png', 390, 2200, measureTips, true)
  t('order 390, pay at the truck: no tip block; Subtotal · Sales tax · Total $25.98', hatch.heights.length === 0 && /Subtotal\s*\$24\.00\s*Sales tax\s*8\.25%\s*\$1\.98\s*Total\s*\$25\.98/.test(hatch.totals || ''), hatch)

  // ── 2 · MANAGE › PAYMENTS ───────────────────────────────────────────────────────────────────────────
  const PT = 'components/manage/PaymentsTab.tsx'
  const pay = await kit.bundle('shots-payments', `export { PaymentsTab } from '@/${PT}'\nexport { ChargesCard } from '@/components/manage/ChargesCard'\nexport { TakingPaymentPanel } from '@/components/manage/TakingPaymentPanel'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'`, {
    patches: [{ file: PT, states: ['status', 'loading'] }],
    stubs: { '@stripe/connect-js': 'export function loadConnectAndInitialize() { return null }', '@stripe/react-connect-js': 'export const ConnectComponentsProvider = p => p.children; export const ConnectAccountOnboarding = () => null; export const ConnectAccountManagement = () => null; export const ConnectNotificationBanner = () => null' },
  })
  const truckRow = { tax_rate_milli: 8250, tipping_enabled: null, service_fee_enabled: true, service_fee_bps: 300, service_fee_fixed_minor: 30, show_paid_step: true, completion_presses: 'two', takes_cash: true }
  const payHtml = settings => {
    globalThis.__ms = { status: { accountId: null, chargesEnabled: false, syncedAt: null, detailsSubmitted: false, cardPaymentsStatus: null, viewer: 'owner', livemode: false }, loading: false }
    try {
      return kit.renderStatic(el('div', { className: 'max-w-3xl mx-auto p-6' }, el(pay.CountrySettingsProvider, { settings },
        el(pay.PaymentsTab, { token: 'harness', plan: 'pro', showToast() {}, afterOnline: el(kit.React().Fragment, null,
          el(pay.ChargesCard, { truck: truckRow, api: async () => ({}), showToast() {}, onTruckUpdate() {} }),
          el(pay.TakingPaymentPanel, { truck: truckRow, api: async () => ({}), showToast() {}, onTruckUpdate() {} })) }))))
    } finally { delete globalThis.__ms }
  }
  const measurePay = () => ({
    text: document.body.innerText,
    // ⚠️ Headings may be upper-cased by CSS, so the order is read case-insensitively.
    order: ['tax, tips and fees', 'taking payment', 'walk-up payments'].map(s => document.body.innerText.toLowerCase().indexOf(s)),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  })
  for (const w of [1440, 820]) {
    const tr = await shoot(payHtml(usC), `phase3-payments-${w}-truck.png`, w, 900, measurePay)
    t(`payments ${w} (truck keeps it): "Tax, tips and fees", then "Taking payment", then "Walk-up payments"`, tr.order.every(i => i >= 0) && tr.order[0] < tr.order[1] && tr.order[1] < tr.order[2], tr.order)
    t(`payments ${w}: "Most you can charge: 4% + 50¢" and "Online service fee $1.02" on $24.00`, tr.text.includes('Most you can charge: 4% + 50¢') && tr.text.includes('as one line: “Online service fee $1.02”.'), tr.text.slice(0, 900))
    t(`payments ${w}: the tip choices 10% 15% 20% and Other amount`, /Choices customers see:\s*10%\s*15%\s*20%\s*Other amount/.test(tr.text))
    t(`payments ${w}: no sideways overflow`, tr.overflow === false)
    const hg = await shoot(payHtml({ ...usC, serviceFeeRecipient: 'hatchgrab', serviceFeeHatchgrabBps: 300, serviceFeeHatchgrabFixedMinor: 30 }), `phase3-payments-${w}-hatchgrab.png`, w, 900, measurePay)
    t(`payments ${w} (HatchGrab keeps it): one line, no controls`, hg.text.includes('HatchGrab adds a 3% + 30¢ service fee to your customers\' online orders. You don\'t pay it and can\'t change it.')
      && !hg.text.includes('Most you can charge'), hg.text.slice(0, 900))
  }

  // ── 3 · ADMIN › COUNTRIES — the fee rows ────────────────────────────────────────────────────────────
  const CT = 'components/admin/CountriesTab.tsx'
  {
    const gb = SEEDS.gbFromSeed(); const usRow = SEEDS.usFromSeed()
    // The tab loads its rows in an effect, so it runs in Chromium for real; its one GET is answered by a
    // Playwright route with the two seed rows (the database is never involved).
    const esb = require(path.join(REPO, 'node_modules/esbuild'))
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'p3-countries-'))
    fs.writeFileSync(path.join(dir, 'entry.tsx'), `import { createRoot } from 'react-dom/client'\nimport CountriesTab from '@/${CT}'\ncreateRoot(document.getElementById('root')!).render(<div style={{ padding: 24 }}><CountriesTab /></div>)\n`)
    await esb.build({ entryPoints: [path.join(dir, 'entry.tsx')], bundle: true, outfile: path.join(dir, 'b.js'), format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020',
      logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], banner: { js: 'window.process = window.process || { env: {} };' },
      define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.svg': 'text', '.png': 'empty' } })
    const js = fs.readFileSync(path.join(dir, 'b.js'), 'utf8')
    const pg = await browser.newPage({ viewport: { width: 1440, height: 3600 }, deviceScaleFactor: 1 })
    await pg.route('http://harness.local/**', r => {
      const u = new URL(r.request().url())
      if (u.pathname === '/api/admin/countries') {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ countries: [gb, { ...usRow, serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 }], truckCounts: { GB: 3, US: 0 } }) })
      }
      return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body class="bg-white"><div id="root"></div><script>${js}</script></body></html>` })
    })
    await pg.goto('http://harness.local/admin')
    await pg.waitForSelector('text=Take our fee', { timeout: 8000 }).catch(() => {})
    // ⚠️ Group headings are upper-cased by CSS, so the text is compared in lower case.
    const txt = (await pg.evaluate(() => document.body.innerText)).toLowerCase()
    await pg.screenshot({ path: path.join(OUT, 'phase3-countries-1440-fee-rows.png'), fullPage: true })
    await pg.close()
    t('countries: "Take our fee" with its hint and the not-charged note', txt.includes('Take our fee'.toLowerCase()) && txt.includes('Off: the rate is shown on plans but never charged'.toLowerCase()) && txt.includes('Not charged yet — switching on has no effect until fee charging is built.'.toLowerCase()), txt.slice(0, 300))
    t('countries: the "Online service fee" group and its four rows', ['Online service fee', 'Online orders only — never pay at the truck or walk-up', 'Allowed in this country', 'Who keeps it', 'HatchGrab\'s fee', 'Most a truck can charge'].every(s => txt.includes(s.toLowerCase())))
    t('countries: GB (fee off, prices include tax) shows the amber UK-law note', txt.includes('If switched on, UK law needs it inside the prices customers first see'.toLowerCase()))
    t('countries: "Tax on fees" — GB reads "— (UK prices include VAT)"', txt.includes('Tax on fees'.toLowerCase()) && txt.includes('— (UK prices include VAT)'.toLowerCase()))
    t('countries: the card-fee hint is fixed', txt.includes('Card fees on the bill aren\'t built yet'.toLowerCase()) && !txt.includes('Who pays the card fee'.toLowerCase()))
  }

  await browser.close()
  console.log(`\n${failures ? `✗ ${failures} of ${checks} failed` : `✓ phase3-screens-shots: ${checks} passed`} — screenshots in docs/screenshots/phase3-*.png`)
  if (failures) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
