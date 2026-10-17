#!/usr/bin/env node
// US layout proposal, group A (customer surfaces + the US landing) — render, paint, measure and crop.
//   node scripts/us-layout-proposal/A/render.cjs <outDir>
// Runs UNCHANGED in the BEFORE tree (copy this folder to the same path there) and in the proposal worktree: REPO is
// resolved from __dirname, so each copy renders its own tree's code with its own tree's compiled CSS (.next/static).
// Every variant patch is `optional`, so a patch whose `from` text is absent (the BEFORE tree) is skipped, not fatal.
//
// Step 1 server-renders the REAL pages from the audit's fixtures (Pizza Kitchen, test-truck / test-kitchen, GB and US;
// scripts/us-layout-audit/A-customer) into <outDir>/html. Step 2 paints them in Playwright WebKit with the app's
// compiled CSS from a 127.0.0.1 throwaway server, measures (<outDir>/measure.json) and saves crops (<outDir>/*.png,
// their boxes in <outDir>/crops.json). No database, no network: the kit stubs Supabase, fetch is never reached.
const fs = require('fs'); const path = require('path')
const F = require('./fixtures.cjs')
const { REPO, C } = F
if (!process.argv[2]) { console.error('usage: render.cjs <outDir>'); process.exit(2) }
const OUT = path.resolve(process.argv[2]); const HTML = path.join(OUT, 'html')
fs.mkdirSync(HTML, { recursive: true })
const kit = require(path.join(REPO, 'scripts/_render-kit.cjs'))({ cacheTag: 'usl-proposal-A' })
const MC = require(path.join(REPO, 'scripts/marketing-country-parity.cjs'))   // the landing's own harness (visit, SEEDS)
const { appCss, fontClasses, serve } = require(path.join(REPO, 'scripts/screenshots/common.cjs'))

const manifest = []
const write = (name, code, body, lang, kind = 'app') => {
  fs.writeFileSync(path.join(HTML, `${name}-${code.toLowerCase()}.html`), body)
  manifest.push({ name, code, lang, kind })
}

async function renderAll() {
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const ORDER_STATES = ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'isScrolled', 'activeCategory', 'noEvents',
    'formSheetOpen', 'payByCard', 'tipSel', 'summaryExpanded', 'sheetSummaryExpanded', 'name', 'email', 'phone', 'slotHour', 'slotMinute', 'availableSlots', 'asapChosen',
    'submitted']
  const O = await kit.bundle('order', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'\nexport * as E from '@/lib/order-charges'\nexport * as R from '@/lib/order-charge-rules'`, {
    patches: [{ file: OP, states: ORDER_STATES }, { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' },
      // AFTER only: open the footer's folded "Tax & fees" row (fix 10). Absent in BEFORE → skipped.
      { file: OP, from: 'const [chargesExpanded, setChargesExpanded] = useState(false)', to: 'const [chargesExpanded, setChargesExpanded] = useState(!!globalThis.__chargesOpen)', optional: true }],
  })
  const MP = 'app/order/[id]/manage/page.tsx'
  const M = await kit.bundle('manage', `export { default as ManagePage } from '@/${MP}'`, { patches: [{ file: MP, states: ['order', 'loading'] }] })
  // "AFTER, GB too" (fix 11, the OPEN QUESTION): the constant flipped at bundle time. Absent in BEFORE → skipped.
  const M2 = await kit.bundle('manage-gbtoo', `export { default as ManagePage } from '@/${MP}'`, {
    patches: [{ file: MP, states: ['order', 'loading'] }, { file: 'lib/customer-layout.ts', from: 'MANAGE_PICKUP_STACK_GB = false', to: 'MANAGE_PICKUP_STACK_GB = true', optional: true }] })
  const TC = 'app/trucks/[slug]/TruckClient.tsx'
  const T = await kit.bundle('truckclient', `export { default as TruckClient } from '@/${TC}'\nexport { createSlug } from '@/lib/utils'`, {
    alias: { '@/hooks/useVillageData': 'scripts/us-layout-proposal/A/stub-village-data.cjs' },
    stubs: { 'posthog-js/react': 'export const usePostHog = () => null', 'next/script': 'export default function Script() { return null }', 'next/dynamic': 'export default function dynamic(_l, o) { return function D() { return o && o.loading ? o.loading() : null } }' },
  })
  const ES = 'app/embed/[slug]/EmbedSchedule.tsx'
  const D = await kit.bundle('domain', `export { default as DomainPage } from '@/app/domain/page'`, {
    patches: [{ file: ES, states: ['events', 'time'] }],
    stubs: { 'next/headers': "export async function headers() { return new Map([['host', 'schedule.pizzakitchen.test']]) }" },
  })

  for (const code of ['GB', 'US']) {
    const c = C[code]
    kit.setNow(c.nowIso); kit.setDeviceTz(c.tz); kit.setDeviceLocale(c.locale)
    const rules = O.R.resolveChargeRules(F.countryRow(code), F.truckChargeFields(code))
    const checkout = O.E.checkoutRulesFrom(rules)   // null for GB, as /api/menu sends none for a UK truck
    const truck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
      ordering_available: true, card_payments_ready: true, allergen_display_mode: 'per_dish', money: c.money, time: c.time, phone: c.phone, ...(checkout ? { checkout } : {}) }
    const E = F.events(c)
    // ⚠️ `sheetSummaryExpanded` is NOT set: each tree's own default is what is being compared (fix 10, A-05).
    const base = { truck, menu: F.menu, events: [E.window, E.third], event: E.window, eventLoading: false, loading: false, noEvents: false, isScrolled: false, activeCategory: 'Pizza',
      basket: F.basket, appliedDeals: [], summaryExpanded: true, formSheetOpen: false, payByCard: true, tipSel: code === 'US' ? 2000 : 'none',
      name: 'Ann Example', email: 'ann@example.test', phone: '', slotHour: '12', slotMinute: '45', availableSlots: F.slots, asapChosen: false, submitted: false }
    const foodMinor = Math.round(F.foodMajor * 100)
    const charges = O.E.computeOrderCharges({ foodMinor, rules, channel: 'online_card', tip: code === 'US' ? { kind: 'percent', bps: 2000 } : null })
    const snapshot = checkout ? charges.snapshot : null
    const totalMajor = charges.totalMinor / 100
    const order = (st, extra = {}) => {
      globalThis.__ms = st; Object.assign(globalThis, extra)
      try { return kit.renderStatic(kit.h(O.I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, kit.h(O.OrderPage, { params: { slug: 'test-kitchen' } }))) }
      finally { delete globalThis.__ms; for (const k of Object.keys(extra)) delete globalThis[k] }
    }
    write('order-menu', code, order({ ...base, summaryExpanded: false }), c.locale)
    write('order-basket', code, order(base), c.locale)
    write('order-basket-fees', code, order(base, { __chargesOpen: true }), c.locale)
    write('order-typical', code, order({ ...base, summaryExpanded: false, event: E.typical, events: [E.typical, E.window] }), c.locale)
    write('order-midnight', code, order({ ...base, summaryExpanded: false, event: E.midnight, events: [E.midnight, E.window] }), c.locale)
    write('order-chooser', code, order({ ...base, event: null, events: [E.window, E.third, E.midnight] }), c.locale)
    write('order-sheet', code, order({ ...base, formSheetOpen: true }), c.locale)
    write('order-sheet-asap', code, order({ ...base, formSheetOpen: true, asapChosen: true, slotHour: '', slotMinute: '' }), c.locale)

    // ── manage-my-order ──
    const items = F.basket.map(b => ({ name: b.menuItem.name, quantity: b.quantity, unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0), modifiers: b.modifiers }))
    const mOrder = { money: c.money, time: c.time, id: '1234', status: 'confirmed', customer_name: 'Ann Example', slot: '12:45', event_date: '2026-09-30', items, deals: [],
      total: totalMajor, payment_status: 'paid', truck_name: 'Pizza Kitchen', venue_name: 'Riverside Park', allow_cancellation: true, cancellation_cutoff_mins: 30, ...(snapshot ? { charges: snapshot } : {}) }
    const manage = (Mod, o) => { globalThis.__ms = { order: o, loading: false }; try { return kit.renderStatic(kit.h(O.I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, kit.h(Mod.ManagePage))) } finally { delete globalThis.__ms } }
    write('manage', code, manage(M, mOrder), c.locale)
    write('manage-longvenue', code, manage(M, { ...mOrder, venue_name: 'Pier 13 Waterfront Market' }), c.locale)
    if (code === 'GB') {
      write('manage-gbtoo', code, manage(M2, mOrder), c.locale)
      write('manage-longvenue-gbtoo', code, manage(M2, { ...mOrder, venue_name: 'Pier 13 Waterfront Market' }), c.locale)
    }

    // ── the public truck page (TruckClient): the truck's own time settings, as app/trucks/[slug]/page.tsx passes them ──
    const slug = T.createSlug('Pizza Kitchen')
    const vEv = e => ({ id: e.id, date: e.date, startTime: e.start_time, endTime: e.end_time, truckName: 'Pizza Kitchen', venueName: e.venue_name, village: e.village, postcode: e.postcode, status: e.status, source: 'operator', orderLinkHg: true, orderLinkVf: true })
    globalThis.__vd = { loading: false, loadError: false, refetch() {}, mapEvents: [E.window, E.third, E.midnight].map(vEv),
      allTrucks: [{ cleanKey: slug, rawName: 'Pizza Kitchen', type: 'Pizza', logoUrl: null, menuUrl: 'https://example.test/menu', phoneNumber: code === 'US' ? '(201) 555-0123' : '07700 900123', websiteUrl: 'https://example.test', orderUrl: null }] }
    write('sched', code, kit.renderStatic(kit.h(T.TruckClient, { slug, locale: c.locale, discovery: code === 'GB', time: c.time })), c.locale)

    // ── the custom-domain page (its body is EmbedSchedule), with the time settings /api/embed/events sends ──
    globalThis.__harnessDb = kit.fakeDb({ trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', logo_storage_path: null, plan: 'pro', feature_overrides: { embed_schedule: true }, trial_expires_at: null, active: true, custom_domain: 'schedule.pizzakitchen.test', custom_domain_verified_at: '2026-09-01T00:00:00Z' }] })
    globalThis.__ms = { events: [E.window, E.third, E.midnight].map(vEv), time: c.time }
    try { const el = await kit.quietAsync(() => D.DomainPage()); write('domain', code, kit.renderStatic(el), c.locale) } finally { delete globalThis.__ms; delete globalThis.__harnessDb }
    console.log(code, 'food', F.foodMajor.toFixed(2), 'total', totalMajor.toFixed(2))
  }

  // ── the landing (fix 13): the REAL page module, as marketing-country-parity.cjs renders it; GB and a switched-on US ──
  const GB = MC.SEEDS.gbFromSeed()
  const US = { ...MC.SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900, proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 }
  for (const [code, ip] of [['GB', 'GB'], ['US', 'US']]) {
    const v = await MC.visit('landing', { rows: [GB, US], ip })
    write('landing', code, v.html, code === 'US' ? 'en-US' : 'en-GB', 'landing')
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
  console.log('rendered', manifest.length, 'pages into', HTML)
}

// ═══════════════════════════════ step 2: paint, measure, crop ═══════════════════════════════
const APP_SIZES = [[360, 800], [390, 844], [768, 1024]]
const LANDING_SIZES = [[390, 844], [1280, 800]]
const LIFT = '.max-h-\\[90vh\\]{max-height:none!important;overflow:visible!important}'

const HELPERS = `
window.__P = (el) => {
  if (!el) return null
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  return { text: el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 90), x: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height),
    lines: Math.round((r.height - pad) / lh), scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight }
}
window.__overflows = (root) => {
  const out = []
  for (const el of (root || document.body).querySelectorAll('*')) {
    if (!el.clientWidth || el.closest('.overflow-x-auto') || el.tagName === 'svg' || el.closest('svg') || el.tagName === 'SELECT') continue
    const d = el.scrollWidth - el.clientWidth
    if (d > 1) out.push({ cls: String(el.className).slice(0, 80), tag: el.tagName, d, text: el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 60) })
  }
  return out
}
window.__textW = (el, s) => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(el); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return c.measureText(s).width }
window.__vis = (el) => !!el && el.getBoundingClientRect().width > 0
`

// TruckListCard, BEFORE and AFTER markup alike: the date/time column, its date line, its range (the innermost span
// holding the en dash), and whichever "Live" is displayed.
const CARD_PROBE = `(() => {
  const cols = [...document.querySelectorAll('div')].filter(d => /(^|\\s)(min-)?w-\\[112px\\]|sm:w-\\[140px\\]/.test(d.className))
  return cols.map(col => {
    const card = col.closest('.rounded-xl')
    const range = [...col.querySelectorAll('span')].find(s => /\\u2013/.test(s.textContent) && !s.querySelector('span'))
    const live = [...col.querySelectorAll('span.text-green-600')].find(__vis)
    const date = [...col.querySelectorAll('span.text-orange-600')][0]
    const venueCol = col.nextElementSibling
    const rr = range && range.getBoundingClientRect(), dr = date && date.getBoundingClientRect(), lr = live && live.getBoundingClientRect()
    const rangeLh = range ? (parseFloat(getComputedStyle(range).lineHeight) || 12) : 12
    return { card: __P(card), cardH: Math.round(card.getBoundingClientRect().height), colW: Math.round(col.getBoundingClientRect().width), date: date && date.innerText,
      range: range && range.innerText, rangeLines: range ? Math.round(rr.height / rangeLh) : null, rangeW: range ? Math.round(rr.width) : null, rangeNaturalW: range ? Math.round(__textW(range, range.textContent)) : null,
      live: !!live, liveOnDateLine: live ? Math.abs((lr.top + lr.bottom) / 2 - (dr.top + dr.bottom) / 2) < 5 : null, liveOnRangeLine: live && range ? Math.abs((lr.top + lr.bottom) / 2 - (rr.top + rr.bottom) / 2) < 5 : null,
      venueW: venueCol ? Math.round(venueCol.getBoundingClientRect().width) : null, h3Trunc: (() => { const h = card.querySelector('h3'); return h ? h.scrollWidth > h.clientWidth + 1 || h.scrollHeight > h.clientHeight + 1 : null })(),
      overflows: __overflows(card) }
  })
})()`
const FOOTER_PROBE = `(() => {
  const f = document.querySelector('div.fixed.bottom-0'); if (!f) return null
  const box = f.querySelector('[data-footer-breakdown]')
  return { h: Math.round(f.getBoundingClientRect().height), pctOfScreen: Math.round(f.getBoundingClientRect().height / innerHeight * 100), viewport: innerWidth + 'x' + innerHeight,
    chargeRows: [...f.querySelectorAll('[data-charge-line]')].map(e => e.innerText.replace(/\\s+/g, ' ')), foldRow: (f.querySelector('[data-charge-fold]') || {}).innerText || null,
    totalsInView: (() => { const t = [...f.querySelectorAll('div.font-black')].find(d => /^Total/.test(d.innerText.trim())); if (!t) return null; const r = t.getBoundingClientRect(), fr = f.getBoundingClientRect(); return r.top >= fr.top && r.bottom <= fr.bottom })(),
    capped: box ? { clientH: box.clientHeight, scrollH: box.scrollHeight } : null, overflows: __overflows(f) }
})()`
const SHEET_PROBE = `(() => {
  const sheet = document.querySelector('.max-h-\\\\[90vh\\\\]'); if (!sheet) return null
  sheet.scrollTop = 0
  const s = sheet.getBoundingClientRect()
  const place = [...sheet.querySelectorAll('button')].find(b => b.className.includes('bg-orange-600') && b.className.includes('w-full') && b.offsetParent)
  const p = place.getBoundingClientRect()
  const totalRow = [...sheet.querySelectorAll('div.font-black')].find(d => /^Total/.test(d.innerText.trim()) && d.offsetParent)
  const t = totalRow && totalRow.getBoundingClientRect()
  const summary = sheet.querySelector('.max-h-\\\\[40vh\\\\]')
  const footer = sheet.querySelector('[data-sheet-footer]')
  return { sheetH: Math.round(s.height), contentH: sheet.scrollHeight, viewportH: innerHeight, placeText: place.innerText,
    placeVisibleAtOpen: p.bottom <= s.bottom + 0.5, scrollToPlace: Math.max(0, Math.round(p.bottom - s.bottom)), placeTopAtOpen: Math.round(p.top - s.top),
    totalVisibleAtOpen: t ? t.bottom <= s.bottom + 0.5 && t.top >= s.top : null, totalText: totalRow ? totalRow.innerText.replace(/\\s+/g, ' ') : null,
    summaryExpandedAtOpen: !!summary, sheetOverflowX: sheet.scrollWidth - sheet.clientWidth, stickyFooterH: footer ? Math.round(footer.getBoundingClientRect().height) : null, footerGapBelow: footer ? Math.round(s.bottom - footer.getBoundingClientRect().bottom) : null, overflows: __overflows(sheet) }
})()`
const MANAGE_PROBE = `(() => {
  const card = document.querySelector('.max-w-sm')
  const row = [...card.querySelectorAll('.flex.justify-between')][0]
  const label = row.children[0], value = row.children[1]
  const lr = label.getBoundingClientRect(), vr = value.getBoundingClientRect(), cs = getComputedStyle(value)
  return { row: __P(row), rowH: Math.round(row.getBoundingClientRect().height), value: value.innerText.replace(/\\n/g, ' / '), valueLines: Math.round(vr.height / parseFloat(cs.lineHeight)),
    gapLabelToValue: Math.round(vr.left - lr.right), valueAlign: cs.textAlign, valueRightEdgeToRow: Math.round(row.getBoundingClientRect().right - vr.right), cardH: Math.round(card.getBoundingClientRect().height), overflows: __overflows(card) }
})()`
const LANDING_PROBE = `(() => {
  const root = document.querySelector('.hg-landing')
  const secs = [...root.querySelectorAll(':scope > section, :scope > .trust-strip, :scope > footer, :scope > div > footer')]
  const name = el => el.id ? '#' + el.id : el.classList.contains('trust-strip') ? 'trust strip' : el.classList.contains('quote-sec') ? 'testimonial' : el.tagName === 'FOOTER' ? 'footer' : (el.querySelector('.eyebrow') || el).innerText.trim().split('\\n')[0].slice(0, 30)
  return secs.map(el => { const bg = getComputedStyle(el).backgroundColor; return { section: name(el), className: el.className || '', bg, tinted: !/rgba?\\(255, 255, 255|rgba\\(0, 0, 0, 0\\)|transparent/.test(bg), top: Math.round(el.getBoundingClientRect().top + scrollY), h: Math.round(el.getBoundingClientRect().height) } })
})()`

const MEASURE = {
  'order-menu': `({ cards: ${CARD_PROBE}, footer: ${FOOTER_PROBE} })`,
  'order-basket': `({ footer: ${FOOTER_PROBE} })`,
  'order-basket-fees': `({ footer: ${FOOTER_PROBE} })`,
  'order-typical': `({ cards: ${CARD_PROBE} })`, 'order-midnight': `({ cards: ${CARD_PROBE} })`, 'order-chooser': `({ cards: ${CARD_PROBE} })`,
  'order-sheet': `({ sheet: ${SHEET_PROBE} })`,
  'order-sheet-asap': `({ sheet: ${SHEET_PROBE} })`,
  'manage': `({ pickup: ${MANAGE_PROBE} })`, 'manage-longvenue': `({ pickup: ${MANAGE_PROBE} })`, 'manage-gbtoo': `({ pickup: ${MANAGE_PROBE} })`, 'manage-longvenue-gbtoo': `({ pickup: ${MANAGE_PROBE} })`,
  'sched': `({ cards: ${CARD_PROBE} })`, 'domain': `({ cards: ${CARD_PROBE} })`,
  'landing': `({ bands: ${LANDING_PROBE} })`,
}

// Crops: [stem, sizes, finder → element | {clip}, dsf, mode]. mode 'tall' = lift the sheet's cap first; 'viewport' = the
// element as it sits on the first screen (no lift); 'end' = the sheet scrolled to its end; 'page' = the whole page.
const HDR = `document.querySelector('main .text-center.mb-5')`
const SHEET = `document.querySelector('.max-h-\\\\[90vh\\\\]')`
const CROPS = {
  'order-menu': [['order-header', [360, 390, 768], HDR, 2], ['basket-collapsed', [360], `document.querySelector('div.fixed.bottom-0')`, 1]],
  'order-typical': [['order-header-typical', [360, 768], HDR, 2]],
  'order-midnight': [['order-header-midnight', [390], HDR, 2]],
  'order-chooser': [['order-chooser', [360, 768], HDR, 1]],
  'order-basket': [['basket-expanded', [360], `document.querySelector('div.fixed.bottom-0')`, 1]],
  'order-basket-fees': [['basket-fees', [360], `document.querySelector('div.fixed.bottom-0')`, 1]],
  'order-sheet': [['sheet-open', [360], SHEET, 1, 'viewport'], ['sheet-end', [360], SHEET, 1, 'end']],
  'order-sheet-asap': [['choose-time', [360, 390], `[...document.querySelectorAll('.max-h-\\\\[90vh\\\\] h2')].find(h => /time/i.test(h.innerText)).parentElement`, 2, 'tall']],
  'manage': [['manage', [360], `document.querySelector('.max-w-sm .px-6.py-4.border-b')`, 2]],
  'manage-longvenue': [['manage-longvenue', [360, 390], `document.querySelector('.max-w-sm .px-6.py-4.border-b')`, 2]],
  'manage-gbtoo': [['manage-gbtoo', [360], `document.querySelector('.max-w-sm .px-6.py-4.border-b')`, 2]],
  'manage-longvenue-gbtoo': [['manage-longvenue-gbtoo', [360, 390], `document.querySelector('.max-w-sm .px-6.py-4.border-b')`, 2]],
  'sched': [['schedule', [360, 768], `document.querySelector('main .animate-in')`, 1]],
  'domain': [['embed', [360, 768], `document.querySelector('.flex.flex-col')`, 1]],
  'landing': [['landing', [390, 1280], `document.querySelector('.hg-landing .trust-strip')`, 1, 'page']],
}
// Elements boxed on the sheets (fix-labelled there), per stem.
const BOXES = {
  'order-header': `[...document.querySelectorAll('div')].filter(d => /(^|\\s)(min-)?w-\\[112px\\]/.test(d.className))`,
  'order-header-typical': `[...document.querySelectorAll('div')].filter(d => /(^|\\s)(min-)?w-\\[112px\\]/.test(d.className))`,
  'order-header-midnight': `[...document.querySelectorAll('div')].filter(d => /(^|\\s)(min-)?w-\\[112px\\]/.test(d.className))`,
  'order-chooser': `[...document.querySelectorAll('div')].filter(d => /sm:w-\\[140px\\]/.test(d.className)).slice(0, 1)`,
  'schedule': `[...document.querySelectorAll('div')].filter(d => /sm:w-\\[140px\\]/.test(d.className)).slice(0, 1)`,
  'embed': `[...document.querySelectorAll('div')].filter(d => /sm:w-\\[140px\\]/.test(d.className)).slice(0, 1)`,
  'manage-longvenue': `[document.querySelector('.max-w-sm .px-6.py-4.border-b .flex.justify-between')]`,
  'manage-longvenue-gbtoo': `[document.querySelector('.max-w-sm .px-6.py-4.border-b .flex.justify-between')]`,
  'manage': `[document.querySelector('.max-w-sm .px-6.py-4.border-b .flex.justify-between')]`,
  'manage-gbtoo': `[document.querySelector('.max-w-sm .px-6.py-4.border-b .flex.justify-between')]`,
  'choose-time': `[document.querySelector('.max-h-\\\\[90vh\\\\] select')]`,
  'basket-expanded': `[document.querySelector('[data-footer-breakdown]') || document.querySelector('div.fixed.bottom-0 .bg-slate-50')]`,
  'basket-fees': `[document.querySelector('[data-charge-fold]') || [...document.querySelectorAll('div.fixed.bottom-0 [data-charge-line]')].slice(1).reduce((a, e) => a, null)].filter(Boolean)`,
  'sheet-open': `[document.querySelector('[data-sheet-footer]') || [...document.querySelectorAll('.max-h-\\\\[90vh\\\\] button')].find(b => b.className.includes('bg-orange-600') && b.className.includes('w-full') && b.offsetParent)]`,
}

// The "Choose time" select (fix 12), measured on the PIXELS: the rightmost ink of its words (the ▾ hidden) against the
// leftmost pixel the ▾ changes (the shot with it minus the shot without it). Positive = the words run into the ▾.
async function chooseTimeInk(page, sharp) {
  const box = await page.evaluate(`(() => { const s = document.querySelector('.max-h-\\\\[90vh\\\\] select'); s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height, text: s.options[s.selectedIndex].text } })()`)
  const shot = async (css) => {
    const tag = css ? await page.addStyleTag({ content: css }) : null
    const buf = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } })
    if (tag) await tag.evaluate(n => n.remove())
    return sharp(buf).raw().toBuffer({ resolveWithObject: true })
  }
  const dsf = await page.evaluate('devicePixelRatio')
  const without = await shot('.max-h-\\[90vh\\] select + .pointer-events-none{visibility:hidden!important}')
  const withArrow = await shot(null)
  const { info } = without; const A = without.data, B = withArrow.data
  let wordsRight = -1, arrowLeft = Infinity, arrowRight = -1
  for (let y = 3 * dsf; y < info.height - 3 * dsf; y++) for (let x = 3 * dsf; x < info.width - 3 * dsf; x++) {
    const i = (y * info.width + x) * info.channels
    if (0.299 * A[i] + 0.587 * A[i + 1] + 0.114 * A[i + 2] < 170) wordsRight = Math.max(wordsRight, x)
    if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 40) { arrowLeft = Math.min(arrowLeft, x); arrowRight = Math.max(arrowRight, x) }
  }
  return { selectW: Math.round(box.width), text: box.text, wordsInkRight: +(wordsRight / dsf).toFixed(1), arrowInkLeft: +(arrowLeft / dsf).toFixed(1), arrowInkRight: +(arrowRight / dsf).toFixed(1),
    overrunPx: +((wordsRight - arrowLeft) / dsf).toFixed(1) }
}

async function paintAll() {
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'))
  const sharp = require(path.join(REPO, 'node_modules/sharp'))
  const css = appCss(); const fc = fontClasses(css)
  let current = ''
  const srv = await serve(() => current)
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const results = {}, cropInfo = {}
  try {
    for (const { name, code, lang, kind } of manifest) {
      const body = fs.readFileSync(path.join(HTML, `${name}-${code.toLowerCase()}.html`), 'utf8').replace(/<img alt="Village Foodie"[^>]*>/g, '')
      const sizes = kind === 'landing' ? LANDING_SIZES : APP_SIZES
      for (const [w, h] of sizes) {
        const crops = (CROPS[name] || []).filter(c => c[1].includes(w))
        const dsfs = [...new Set([1, ...crops.map(c => c[3])])]
        for (const dsf of dsfs) {
          const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf })
          current = kind === 'landing'
            ? `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${body}</body></html>`
            : `<!doctype html><html lang="${lang}" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="${fc}">${body}</body></html>`
          await page.goto(srv.url, { waitUntil: 'load' })
          await page.evaluate(() => document.fonts.ready)
          await page.addScriptTag({ content: HELPERS })
          if (dsf === 1) {
            const m = await page.evaluate(MEASURE[name])
            m.docOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
            if (name === 'order-sheet-asap') m.chooseTime = await chooseTimeInk(page, sharp)
            results[`${name}|${code}|${w}`] = m
          }
          for (const [stem, , finder, cdsf, mode] of crops.filter(c => c[3] === dsf)) {
            if (mode === 'tall') { await page.setViewportSize({ width: w, height: 3200 }); await page.addStyleTag({ content: LIFT }); await page.waitForTimeout(50) }
            if (mode === 'end') await page.evaluate(`(() => { const s = ${finder}; s.scrollTop = s.scrollHeight })()`)
            if (mode === 'viewport') await page.evaluate(`(() => { const s = ${finder}; s.scrollTop = 0 })()`)
            const box = await page.evaluate(`(() => { const f = ${finder}; const pad = ${mode === 'page' ? 0 : 6}; const r = f.getBoundingClientRect()
              if ('${mode}' === 'page') { const end = document.querySelector('.hg-landing footer, .hg-landing > footer'); const e = end ? end.getBoundingClientRect().top + scrollY + 40 : document.documentElement.scrollHeight; return { x: 0, y: Math.round(r.top + scrollY), width: innerWidth, height: Math.round(e - r.top - scrollY) } }
              if ('${mode}' === 'viewport' || '${mode}' === 'end') return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(innerWidth, r.width), height: Math.min(innerHeight - Math.max(0, r.top), r.height) }
              return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top + scrollY - pad), width: Math.min(innerWidth, r.width + 2 * pad), height: r.height + 2 * pad } })()`)
            box.width = Math.min(box.width, w - box.x)
            const file = path.join(OUT, `${stem}-${w}-${code.toLowerCase()}.png`)
            await page.screenshot({ path: file, clip: box, fullPage: mode !== 'viewport' && mode !== 'end' })
            const fixed = mode === 'viewport' || mode === 'end'
            const hl = BOXES[stem] ? await page.evaluate(`(${BOXES[stem]}).filter(Boolean).map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + ${fixed ? 0 : 'scrollY'}), w: Math.round(r.width), h: Math.round(r.height) } })`) : []
            cropInfo[path.basename(file)] = { clip: box, dsf: cdsf, boxes: hl.map(b => ({ x: b.x - box.x, y: b.y - box.y, w: b.w, h: b.h })) }
            if (mode === 'tall') await page.setViewportSize({ width: w, height: h })
          }
          await page.close()
        }
      }
      process.stdout.write(`${name}-${code} `)
    }
  } finally { await browser.close(); srv.close() }
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(results, null, 1))
  fs.writeFileSync(path.join(OUT, 'crops.json'), JSON.stringify(cropInfo, null, 1))
  console.log('\nmeasured', Object.keys(results).length, '→', path.join(OUT, 'measure.json'))
}

;(async () => { await renderAll(); await paintAll() })().catch(e => { console.error(e); process.exit(1) })
