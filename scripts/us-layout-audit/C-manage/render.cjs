#!/usr/bin/env node
// scripts/us-layout-audit/C-manage/render.cjs — US layout audit, group C (Manage). DIAGNOSIS ONLY.
//   node scripts/us-layout-audit/C-manage/render.cjs [rawOut.json]
//
// Renders the REAL Manage components (ScheduleTab, SettingsTab, BillingTab from app/manage/[token]/page.tsx;
// PaymentsTab + ChargesCard + TakingPaymentPanel; the shell's trial popup via scripts/_lp1d2-shell.cjs) to static
// HTML with state-patched useStates (scripts/_render-kit.cjs), for a GB and a US Pizza Kitchen at the SAME moment
// (Wednesday 30 September 2026, 11:50 local), then paints each in WebKit with the compiled app CSS + Geist fonts
// (served on 127.0.0.1 by scripts/screenshots/common.cjs) at five sizes, MEASURES the boxes and writes cropped PNGs
// to docs/us-layout-audit/C-manage/. Fixtures only — nothing reaches a database or the network.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const OUT = path.join(REPO, 'docs/us-layout-audit/C-manage')
const RAW = process.argv[2] || path.join(REPO, 'node_modules/.cache/usaudit-C-raw.json')
fs.mkdirSync(OUT, { recursive: true })

const SIZES = [
  { id: 'phone', w: 390, h: 844 },
  { id: 'ipadp', w: 810, h: 1080 },
  { id: 'droidtab', w: 800, h: 1280 },
  { id: 'ipadl', w: 1180, h: 820 },
  { id: 'laptop', w: 1280, h: 800 },
]
const MOMENT = { GB: '2026-09-30T10:50:00Z', US: '2026-09-30T15:50:00Z' }
const ZONE = { GB: 'Europe/London', US: 'America/New_York' }

const kit = require('../../_render-kit.cjs')({ cacheTag: 'usaudit-C-manage' })
const FIX = require('../../_lp1d2-fixtures.cjs')
const SET = require('../../_lp1d-settings.cjs')
const { CATS, ITEMS, SUBCATS } = require('../../_lp1d-menu.cjs')
const common = require('../../screenshots/common.cjs')
kit.setNow(MOMENT.GB); kit.setDeviceTz(ZONE.GB)
const ctx = FIX.context(kit, REPO)
const { h, states, inManage, PROVIDERS } = ctx

// ── THE TWO FIXTURES ────────────────────────────────────────────────────────────────────────────────────
const GB = ctx.GB
const usTime = { ...ctx.US.time, timeZone: ZONE.US }
const US = {
  ...ctx.US, time: usTime,
  settings: { ...ctx.US.settings, serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 },
  truck: { ...ctx.US.truck, timezone: ZONE.US, time: usTime, tax_rate_milli: 8875, tipping_enabled: true, service_fee_enabled: true, service_fee_bps: 300, service_fee_fixed_minor: 30 },
}
const C = { GB, US }

// ── EVENTS (the worst-case values: 11:30–22:45, an event across midnight 20:00–00:30, the fixture date) ──
const ev = (o) => ({ truck_id: 'test-truck', venue_address: null, address: null, town: null, postcode: null, start_time: null, end_time: null,
  status: 'confirmed', auto_open: true, auto_close: true, opened_at: null, closed_at: null, confirmed_at: null, customer_note: null, notes: null,
  source: 'manual', van_id: null, is_private: false, private_name: null, event_deals: [], venue_match_confidence: 'high', latitude: 52.2, longitude: 0.6, ...o })
const place = cc => cc === 'US' ? { town: 'Springfield', postcode: '62701' } : { town: 'Harnessville', postcode: 'CB8 8XX' }
const eventsFor = cc => [
  ev({ id: 'ev-open', event_date: '2026-09-30', venue_name: 'Market Square', ...place(cc), start_time: '11:30', end_time: '22:45', status: 'open', van_id: 'v2' }),
  ev({ id: 'ev-late', event_date: '2026-10-02', venue_name: 'The Old Crown', ...place(cc), start_time: '20:00', end_time: '00:30', status: 'confirmed', van_id: 'v1' }),
  ev({ id: 'ev-op', event_date: '2026-10-03', venue_name: 'Village Hall', ...place(cc), start_time: '11:30', end_time: '22:45', status: 'unconfirmed', van_id: 'v1' }),
  ev({ id: 'ev-priv', event_date: '2026-10-07', venue_name: 'Community Centre', ...place(cc), start_time: '11:30', end_time: '22:45', status: 'confirmed', is_private: true, private_name: 'Sarah & Tom’s wedding', van_id: 'v2' }),
  ev({ id: 'pend-late', event_date: '2026-10-05', venue_name: 'Riverside Brewery', ...place(cc), start_time: '20:00', end_time: '00:30', status: 'unconfirmed', source: 'scraper', van_id: 'v1' }),
  ev({ id: 'pend-day', event_date: '2026-10-02', venue_name: 'Farmers Market', ...place(cc), start_time: '11:30', end_time: '22:45', status: 'unconfirmed', source: 'scraper', van_id: 'v2' }),
  ev({ id: 'pend-priv', event_date: '2026-10-09', venue_name: 'Private Event', status: 'unconfirmed', source: 'scraper', is_private: true, venue_match_confidence: 'low', latitude: 55.37, longitude: -3.43 }),
]
const VANS = [{ ...SET.VANS[0], id: 'v1', name: 'Van 1', collection_interval_mins: 15, operator_collection_interval_mins: 5 }, { ...SET.VANS[1], id: 'v2', name: 'Big van' }]
const PRIVATE_TYPE = { id: 'type-private', name: 'Private', kind: 'private', upcoming: 0 }
const IMPORT = cc => [
  { id: 'x1', event_date: '30/09/2026', venue_name: 'Market Square', town: place(cc).town, postcode: place(cc).postcode, start_time: '11:30', end_time: '22:45', selected: true, van_id: 'v2' },
  { id: 'x2', event_date: '02/10/2026', venue_name: 'The Old Crown', town: place(cc).town, postcode: place(cc).postcode, start_time: '20:00', end_time: '00:30', selected: true, van_id: 'v1' },
  { id: 'x3', event_date: '03/10/2026', venue_name: 'Village Hall', town: place(cc).town, postcode: place(cc).postcode, start_time: '12:45', end_time: '22:45', selected: true },
]

async function main() {
  // ── BUNDLES ─────────────────────────────────────────────────────────────────────────────────────────────
  const M_FILE = 'app/manage/[token]/page.tsx'
  const ET = 'components/manage/EventTypes.tsx'
  const SCHED = ['events', 'loadingEvents', 'vans', 'placeTypeChoices', 'editingEvent', 'showImportModal', 'importModalTitle', 'extractedEvents', 'editedEvents',
    'expandedEventIds', 'eventTypeId', 'addMode']
  const SETT = ['firstVanId', 'intervalsAvailable', 'perVanCategoriesAvailable', 'vanCashAvailable', 'settingsExclusionList', 'preordersOn', 'gType', 'gVal', 'gAction', 'gOpen']
  const BILL = ['showUpgradeModal', 'upgradeTarget', 'showMatrix']
  const M = await kit.bundle('usaudit-C-manage', [
    `export { ScheduleTab, SettingsTab, BillingTab } from '@/${M_FILE}'`, PROVIDERS,
  ].join('\n'), {
    patches: [
      { file: M_FILE, append: 'export { ScheduleTab, SettingsTab, BillingTab }' },
      { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
      { file: M_FILE, states: states(M_FILE, [...new Set([...SCHED, ...SETT, ...BILL])]) },
      { file: ET, states: states(ET, ['types', 'ready', 'usual']) },
    ],
  })
  const PT = 'components/manage/PaymentsTab.tsx'
  const P = await kit.bundle('usaudit-C-payments', [`export { PaymentsTab } from '@/${PT}'`, "export { ChargesCard } from '@/components/manage/ChargesCard'",
    "export { TakingPaymentPanel } from '@/components/manage/TakingPaymentPanel'", PROVIDERS].join('\n'), {
    patches: [{ file: PT, states: states(PT, ['status', 'loading']) }],
    stubs: { '@stripe/connect-js': 'export function loadConnectAndInitialize() { return null }', '@stripe/react-connect-js': 'export const ConnectComponentsProvider = p => p.children; export const ConnectAccountOnboarding = () => null; export const ConnectAccountManagement = () => null; export const ConnectNotificationBanner = () => null' },
  })

  const noop = () => {}
  const api = async () => ({})
  const views = {}   // views[name][cc] = { body, wrap }
  const put = (name, cc, body, wrap = 'tab') => { if (typeof body !== 'string' || body.startsWith('ERROR')) throw new Error(`${name}/${cc}: ${String(body).slice(0, 400)}`); (views[name] ||= {})[cc] = { body, wrap } }

  for (const cc of ['GB', 'US']) {
    const X = C[cc]
    kit.setNow(MOMENT[cc]); kit.setDeviceTz(ZONE[cc]); kit.setDeviceLocale(X.locale)
    const W = el => inManage(M, X, el)
    const truck = { ...X.truck }
    const sProps = { isActive: true, section: 'events', onSectionChange: noop, onOpenSocial: noop, truck, token: 'harness', bundles: [], categories: CATS, notices: null,
      api, showToast: noop, onTruckUpdate: noop, onVerifySuccess: noop, onSwitchTab: noop, pendingVerifyEvents: null, onClearPendingVerify: noop, onPendingCount: noop, onEventsSaved: noop }
    const sBase = { events: eventsFor(cc), loadingEvents: false, vans: VANS, placeTypeChoices: [PRIVATE_TYPE], types: [PRIVATE_TYPE], ready: true, usual: null,
      firstVanId: 'v1', intervalsAvailable: true, perVanCategoriesAvailable: true, vanCashAvailable: true }
    const sched = st => ctx.html({ ...sBase, ...st }, W(h(M.ScheduleTab, sProps)))
    put('schedule-list', cc, sched({}))
    const open = eventsFor(cc)[0]
    put('schedule-editor', cc, sched({ editingEvent: { id: open.id, venue_name: open.venue_name, town: open.town, postcode: open.postcode, address: '', event_date: open.event_date,
      start_time: '11:30', end_time: '22:45', notes: '', truck_id: 'test-truck', van_id: 'v2', is_private: false, private_name: '' }, addMode: 'manual' }), 'modal')
    put('schedule-editor-midnight', cc, sched({ editingEvent: { id: 'ev-late', venue_name: 'The Old Crown', town: open.town, postcode: open.postcode, address: '', event_date: '2026-10-02',
      start_time: '20:00', end_time: '00:30', notes: '', truck_id: 'test-truck', van_id: 'v1', is_private: false, private_name: '' }, addMode: 'manual' }), 'modal')
    put('schedule-import', cc, sched({ showImportModal: true, importModalTitle: 'found', extractedEvents: IMPORT(cc), editedEvents: IMPORT(cc), expandedEventIds: new Set(['x1', 'x2']) }), 'modal')

    // Settings › pre-order deadline (a daily cut-off at 12:45) and per-van collection times
    const items = ITEMS.map((it, i) => ({ ...it, preorder_enabled: i < 3 }))
    const setProps = { userRole: 'owner', truck, whatsappConnection: null, whatsappUsage: null, onConnectionUpdate: noop, token: 'harness', api, showToast: noop,
      onVerifySuccess: noop, onSwitchTab: noop, categories: CATS, items, subcategories: SUBCATS, onTruckUpdate: noop, onItemsPatch: noop, onCategoriesPatch: noop,
      onOpenWalkthrough: noop, notices: null }
    put('settings', cc, ctx.html({ ...sBase, vans: VANS, settingsExclusionList: [], preordersOn: true, gType: 'daily_cutoff', gVal: 765, gAction: 'sold_out', gOpen: '2d' }, W(h(M.SettingsTab, setProps))))

    // Payments › Tax, tips and fees (+ the card-fee lines in PaymentsTab)
    const chargesTruck = { tax_rate_milli: truck.tax_rate_milli, tipping_enabled: truck.tipping_enabled, service_fee_enabled: truck.service_fee_enabled,
      service_fee_bps: truck.service_fee_bps, service_fee_fixed_minor: truck.service_fee_fixed_minor, show_paid_step: true, completion_presses: 'two', takes_cash: true }
    put('payments', cc, ctx.html({ status: { accountId: 'acct_x', chargesEnabled: true, syncedAt: '2026-09-30T09:00:00Z', detailsSubmitted: true, cardPaymentsStatus: 'active', viewer: 'owner', livemode: true }, loading: false },
      inManage(P, X, h(P.PaymentsTab, { token: 'harness', plan: 'max', showToast: noop, afterOnline: h(kit.React().Fragment, null,
        h(P.ChargesCard, { truck: chargesTruck, api, showToast: noop, onTruckUpdate: noop }),
        h(P.TakingPaymentPanel, { truck: chargesTruck, api, showToast: noop, onTruckUpdate: noop })) }))))

    // Billing: a trial that ends today (Wednesday 30 September), the comparison with four columns; and Max with the matrix open
    const trialEnd = '2026-09-30T20:00:00Z'   // 21:00 London / 16:00 New York — the same calendar day in both
    put('billing-trial', cc, ctx.html({}, W(h(M.BillingTab, { truck: { ...truck, plan: 'trial', trial_expires_at: trialEnd } }))))
    put('billing-max', cc, ctx.html({ showMatrix: true }, W(h(M.BillingTab, { truck: { ...truck, plan: 'max' } }))))
    put('billing-upgrade', cc, ctx.html({ showUpgradeModal: true, upgradeTarget: 'max' }, W(h(M.BillingTab, { truck: { ...truck, plan: 'trial', trial_expires_at: trialEnd } }))), 'modal')
  }

  // The shell's trial popup — scripts/_lp1d2-shell.cjs renders it (its own fixture: trial ends 20 November 2026);
  // the date is re-set to the audit's worst-case "30 September 2026" in the painted HTML (same words, longest month).
  {
    const SH = require('../../_lp1d2-shell.cjs')
    kit.setNow(MOMENT.GB); kit.setDeviceTz(ZONE.GB)
    const out = await kit.quietAsync(() => SH.views(ctx))
    for (const cc of ['GB', 'US']) {
      let body = out[`${cc}|shell|trialPopup|dated`]
      if (typeof body !== 'string' || body.startsWith('ERROR')) { console.log('trial popup not rendered:', String(body).slice(0, 200)); continue }
      body = body.replace(/\b(19|20) November 2026/g, '30 September 2026').replace(/November (19|20), 2026/g, 'September 30, 2026')
      put('trial-popup', cc, body, 'shell')
    }
  }
  kit.setDeviceTz(ZONE.GB)

  // ── PAINT AND MEASURE ──────────────────────────────────────────────────────────────────────────────────
  const css = common.appCss(); const fonts = common.fontClasses(css)
  let current = ''
  const srv = await common.serve(() => current)
  const pageHtml = (cc, v) => {
    const lang = cc === 'US' ? 'en-US' : 'en-GB'
    const inner = v.wrap === 'shell' ? v.body
      : `<main class="w-full pb-6 px-4"><div class="manage-tab-pad pt-6">${v.body}</div></main>`
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>html,body{margin:0}</style></head><body class="${fonts} bg-slate-50">${inner}</body></html>`
  }
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const raw = {}
  try {
    for (const cc of ['GB', 'US']) {
      const context = await browser.newContext({ locale: cc === 'US' ? 'en-US' : 'en-GB', timezoneId: ZONE[cc], deviceScaleFactor: 1 })
      const page = await context.newPage()
      for (const [name, byCc] of Object.entries(views)) {
        const v = byCc[cc]; if (!v) continue
        current = pageHtml(cc, v)
        await page.setViewportSize({ width: SIZES[0].w, height: SIZES[0].h })
        await page.goto(srv.url, { waitUntil: 'load' })
        await page.evaluate(() => document.fonts && document.fonts.ready)
        for (const S of SIZES) {
          await page.setViewportSize({ width: S.w, height: S.h })
          await page.waitForTimeout(60)
          const m = await page.evaluate(MEASURE, name)
          ;(raw[name] ||= {})[S.id] ||= {}
          raw[name][S.id][cc] = m
          // One PNG per crop: `crops` names several regions of one view (e.g. Settings › pre-orders / collection times).
          const crops = m.crops ? Object.entries(m.crops).filter(([, c]) => c) : [['', m.crop]]
          const fullH = await page.evaluate(() => document.documentElement.scrollHeight)
          if (!m.fixed && fullH > S.h) await page.setViewportSize({ width: S.w, height: Math.min(fullH, 6000) })
          raw[name][S.id][cc].png = {}
          for (const [key, c] of crops) {
            const file = `${name}${key ? '-' + key : ''}-${S.w}-${cc.toLowerCase()}.png`
            if (c && c.w > 0 && c.h > 0) await page.screenshot({ path: path.join(OUT, file), clip: { x: c.x, y: c.y, width: Math.min(c.w, S.w - c.x), height: c.h } })
            else await page.screenshot({ path: path.join(OUT, file) })
            raw[name][S.id][cc].png[key || 'main'] = `docs/us-layout-audit/C-manage/${file}`
          }
          if (!m.fixed && fullH > S.h) await page.setViewportSize({ width: S.w, height: S.h })
        }
      }
      await context.close()
    }
  } finally { await browser.close(); srv.close() }
  fs.writeFileSync(RAW, JSON.stringify(raw, null, 1))
  console.log(`wrote ${Object.keys(raw).length} views × ${SIZES.length} sizes × 2 — raw: ${path.relative(REPO, RAW)}`)
}

// ── THE IN-PAGE MEASURE (runs in WebKit) ─────────────────────────────────────────────────────────────────
function MEASURE(view) {
  const R = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) } }
  const lh = el => { const cs = getComputedStyle(el); const v = parseFloat(cs.lineHeight); return isNaN(v) ? parseFloat(cs.fontSize) * 1.2 : v }
  const lines = el => { const cs = getComputedStyle(el); const inner = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth); return Math.max(1, Math.round(inner / lh(el))) }
  const canvas = document.createElement('canvas').getContext('2d')
  const textW = (el, s) => { const cs = getComputedStyle(el); canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return canvas.measureText(s).width }
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const byText = (sel, re) => [...document.querySelectorAll(sel)].filter(e => re.test(e.textContent || '') && vis(e))
  const union = els => { const bs = els.filter(Boolean).map(R); if (!bs.length) return null; const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y)); return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y } }
  const pad = (b, p = 8) => b && ({ x: Math.max(0, b.x - p), y: Math.max(0, b.y - p), w: Math.min(window.innerWidth - Math.max(0, b.x - p), b.w + 2 * p), h: b.h + 2 * p })
  const selects = root => [...root.querySelectorAll('select')].filter(vis).map(s => {
    const label = s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''
    const cs = getComputedStyle(s)
    const avail = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const need = textW(s, label)
    return { label, aria: s.getAttribute('aria-label'), box: R(s), avail: Math.round(avail), need: Math.round(need), cut: Math.max(0, Math.round(need - avail)) }
  })
  const inputs = root => [...root.querySelectorAll('input[type=date],input[type=time]')].filter(vis).map(i => ({ type: i.type, value: i.value, box: R(i), over: i.scrollWidth - i.clientWidth }))
  // Generic scan: an element that clips its own text (ellipsis / overflow hidden) and whose text is wider than its box.
  const clipped = root => [...root.querySelectorAll('*')].filter(vis).filter(el => {
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return false
    const cs = getComputedStyle(el)
    return (cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth - el.clientWidth > 1 && (el.textContent || '').trim()
  }).slice(0, 20).map(el => ({ text: (el.textContent || '').trim().slice(0, 60), over: el.scrollWidth - el.clientWidth, box: R(el) }))
  const pageScrollX = document.documentElement.scrollWidth - window.innerWidth
  const out = { view, vw: window.innerWidth, pageScrollX }

  if (view === 'schedule-list') {
    const cards = [...document.querySelectorAll('.w-12.flex-shrink-0')].map(dc => dc.closest('.px-4.py-3')).filter(Boolean)
    out.cards = cards.map(card => {
      const details = card.querySelector('.flex.items-start.gap-4 > .flex-1.min-w-0')
      const venue = details && details.querySelector('p.text-sm.font-bold')
      const time = details && details.querySelector('p.text-sm.font-semibold.text-slate-700')
      const actions = card.querySelector('.flex.items-start.gap-4 > .flex-shrink-0.self-start')
      const dateCol = card.querySelector('.w-12.flex-shrink-0')
      const conflict = [...card.querySelectorAll('p.text-xs.text-amber-700')]
      return { venue: venue ? venue.textContent : '?', time: time ? time.innerText : null, timeLines: time ? lines(time) : 0, timeBox: time ? R(time) : null,
        timeTextW: time ? Math.round(textW(time, time.innerText.split('\n')[0])) : 0,
        detailsW: details ? Math.round(details.getBoundingClientRect().width) : 0, actionsW: actions ? Math.round(actions.getBoundingClientRect().width) : 0,
        dateColOver: dateCol ? dateCol.scrollWidth - dateCol.clientWidth : 0, dateCol: dateCol ? dateCol.innerText.replace(/\n/g, ' ') : '',
        cardH: Math.round(card.getBoundingClientRect().height), cardBox: R(card),
        conflict: conflict.map(p => ({ text: p.innerText, lines: lines(p), box: R(p) })) }
    })
    const first = cards[0], last = cards[cards.length - 1]
    const sec = document.querySelector('h2') ? document.querySelector('h2').closest('div') : null
    out.crop = pad(union([first, last, ...cards]), 12)
    out.header = sec ? R(sec) : null
  } else if (view.startsWith('schedule-editor')) {
    const modal = [...document.querySelectorAll('.fixed')].find(vis)
    const startLbl = byText('label', /^Start time/)[0]
    const field = startLbl ? startLbl.closest('.grid') : null
    out.fixed = true
    out.selects = selects(field || modal || document.body)
    out.allSelects = selects(modal || document.body)
    out.inputs = inputs(modal || document.body)
    out.fieldRow = field ? R(field) : null
    out.selectsH = out.selects.map(s => s.box.h)
    const prev = document.querySelector('[data-preview-pane]')
    if (prev && vis(prev)) { const p = [...prev.querySelectorAll('p,span,div')].filter(e => /AM|PM|\d{2}:\d{2}/.test(e.textContent || '') && e.children.length === 0); out.preview = p.map(e => ({ text: e.innerText, lines: lines(e), box: R(e) })); out.previewBox = R(prev) }
    // the phone's pinned preview card / one-line preview
    const oneLine = [...(modal || document.body).querySelectorAll('p,span')].filter(e => vis(e) && e.children.length === 0 && /(AM|PM|\d{2}:\d{2})\s*[–-]/.test(e.textContent || ''))
    out.timeTexts = oneLine.slice(0, 6).map(e => ({ text: e.innerText, lines: lines(e), box: R(e), over: e.scrollWidth - e.clientWidth }))
    out.clipped = clipped(modal || document.body)
    out.crop = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
  } else if (view === 'schedule-import') {
    const modal = [...document.querySelectorAll('.fixed')].find(vis)
    const inner = modal ? modal.firstElementChild : document.body
    out.fixed = true
    out.selects = selects(inner)
    out.inputs = inputs(inner)
    out.dateLabels = [...inner.querySelectorAll('td div.cursor-pointer, button span.font-medium, span.text-slate-800.font-medium')].filter(vis).slice(0, 6).map(e => ({ text: e.innerText, lines: lines(e), box: R(e), over: e.scrollWidth - e.clientWidth }))
    out.summaries = [...inner.querySelectorAll('p,span')].filter(e => vis(e) && e.children.length === 0 && /(AM|PM|\d{2}:\d{2})\s*[–-]/.test(e.textContent || '')).slice(0, 6).map(e => ({ text: e.innerText, lines: lines(e), box: R(e), over: e.scrollWidth - e.clientWidth }))
    out.innerScrollX = inner.scrollWidth - inner.clientWidth
    const tbl = inner.querySelector('table'); out.tableOver = tbl && vis(tbl) ? tbl.parentElement.scrollWidth - tbl.parentElement.clientWidth : null
    out.clipped = clipped(inner)
    out.crop = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
  } else if (view === 'settings') {
    const po = byText('p.text-base.font-bold', /^Pre-orders?/)[0]
    const poCard = po ? po.closest('.p-4') || po.parentElement.parentElement : null
    const collBox = [...document.querySelectorAll('div.mt-3.bg-slate-50')].find(d => vis(d) && d.querySelector('select') && /\d{1,2}:\d{2}/.test(d.textContent || ''))
    out.preorderCard = poCard ? R(poCard) : null
    out.collectionBox = collBox ? R(collBox) : null
    const timeInput = poCard ? poCard.querySelector('input[type=time]') : null
    if (timeInput) {
      const cs = getComputedStyle(timeInput)
      out.cutoffInput = { value: timeInput.value, box: R(timeInput), over: timeInput.scrollWidth - timeInput.clientWidth, fontSize: cs.fontSize,
        wrapW: Math.round(timeInput.parentElement.getBoundingClientRect().width) }
    }
    const row = timeInput ? timeInput.parentElement.parentElement : null
    out.deadlineRow = row ? { box: R(row), over: row.scrollWidth - row.clientWidth, right: Math.round(row.lastElementChild.getBoundingClientRect().right), cardRight: poCard ? Math.round(poCard.getBoundingClientRect().right) : null } : null
    out.ruleSummary = poCard ? [...poCard.querySelectorAll('p.text-xs')].filter(p => /\d/.test(p.textContent)).slice(0, 3).map(p => ({ text: p.innerText, lines: lines(p), box: R(p) })) : []
    out.collectionExamples = collBox ? [...collBox.querySelectorAll('p.text-xs')].filter(p => /\d/.test(p.textContent)).map(p => ({ text: p.innerText, lines: lines(p), box: R(p) })) : []
    out.collectionSelects = collBox ? selects(collBox) : []
    out.pageScrollX = pageScrollX
    out.crop = pad(union([poCard, collBox]), 12)
    // two crops: keep them separately too
    out.crops = { preorder: pad(poCard ? R(poCard) : null, 8), collection: pad(collBox ? R(collBox) : null, 8) }
  } else if (view === 'payments') {
    const card = document.querySelector('[data-charges-row]') ? document.querySelector('[data-charges-row]').closest('.p-4') : null
    out.chargesCard = card ? R(card) : null
    if (card) {
      out.rows = [...card.querySelectorAll('[data-charges-row]')].map(r => ({ id: r.getAttribute('data-charges-row'), box: R(r), over: r.scrollWidth - r.clientWidth,
        texts: [...r.querySelectorAll('p')].map(p => ({ text: p.innerText.slice(0, 120), lines: lines(p) })) }))
      const boxes = card.querySelector('[data-fee-boxes]'); out.feeBoxes = boxes ? { box: R(boxes), over: boxes.scrollWidth - boxes.clientWidth } : null
      const chips = card.querySelector('[data-tip-chips]'); out.tipChips = chips ? { box: R(chips), lines: Math.round(chips.getBoundingClientRect().height / 26) } : null
      out.inputs = [...card.querySelectorAll('input')].map(i => { const cs = getComputedStyle(i); return { value: i.value, box: R(i), need: Math.round(textW(i, i.value)), avail: Math.round(i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) } })
    }
    const feeLines = [...document.querySelectorAll('p,li,span')].filter(e => vis(e) && e.children.length <= 1 && /\d+(\.\d+)?%\s*\+/.test(e.textContent || '')).slice(0, 8)
    out.feeLines = feeLines.map(e => ({ text: e.innerText.slice(0, 140), lines: lines(e), box: R(e) }))
    out.clipped = clipped(document.body)
    const all = document.querySelector('main')
    out.crop = pad(R(all.firstElementChild), 0)
  } else if (view.startsWith('billing')) {
    const root = document.querySelector('main') || document.body
    out.fixed = view === 'billing-upgrade'
    const trialHead = byText('p.text-sm.font-bold', /trial ends/i)[0]
    out.trial = byText('p', /trial|charged/i).filter(p => p.children.length === 0 && /\d{4}/.test(p.textContent)).map(p => ({ text: p.innerText.slice(0, 160), lines: lines(p), box: R(p) }))
    out.buttons = [...root.querySelectorAll('button')].filter(b => vis(b) && /—|\/mo|\$|£/.test(b.textContent)).map(b => { const card = b.closest('.rounded-xl') || b.parentElement; return { text: b.innerText, box: R(b), over: b.scrollWidth - b.clientWidth, right: Math.round(b.getBoundingClientRect().right), parentRight: Math.round(card.getBoundingClientRect().right) } })
    // the matrix price/fee columns (w-14 on a phone)
    const cols = [...root.querySelectorAll('.w-14')].filter(vis)
    out.matrixCells = cols.filter(c => (c.textContent || '').trim() && /[\d$£¢p%]/.test(c.textContent)).map(c => {
      const kids = [...c.querySelectorAll('*')]; const wide = Math.max(c.scrollWidth, ...kids.map(k => k.scrollWidth))
      return { text: c.innerText.replace(/\n/g, ' | ').slice(0, 60), w: Math.round(c.getBoundingClientRect().width), scrollW: wide, over: wide - c.clientWidth, lines: lines(c), h: Math.round(c.getBoundingClientRect().height), box: R(c) }
    })
    const priceRow = cols[0] ? cols[0].parentElement : null
    out.priceHeader = priceRow ? R(priceRow) : null
    out.upgradeModal = view === 'billing-upgrade' ? [...document.querySelectorAll('.fixed .max-w-sm p')].map(p => ({ text: p.innerText.slice(0, 160), lines: lines(p) })) : null
    out.clipped = clipped(root)
    out.crop = view === 'billing-upgrade' ? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight } : pad(R(root.querySelector('.flex.flex-col.gap-6') || root), 0)
    if (out.crop && out.crop.h > 2600) out.crop.h = 2600
    if (trialHead) out.trialHead = { text: trialHead.innerText, lines: lines(trialHead), box: R(trialHead) }
  } else if (view === 'trial-popup') {
    const pop = document.querySelector('.max-w-sm.w-full.p-6') || document.querySelector('.max-w-sm')
    out.fixed = true
    out.popup = pop ? { box: R(pop), texts: [...pop.querySelectorAll('p,h2')].map(p => ({ text: p.innerText.slice(0, 200), lines: lines(p), box: R(p) })) } : null
    out.crop = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
  }
  return out
}

main().catch(e => { console.error(e); process.exit(1) })
