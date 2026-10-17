#!/usr/bin/env node
// scripts/us-layout-proposal/C/render.cjs — US layout PROPOSAL, group C (Manage): fixes 3, 4, 5, 12 (+ fix 1 on Manage).
//   node scripts/us-layout-proposal/C/render.cjs <outDir>
//
// Adapted from scripts/us-layout-audit/C-manage/render.cjs (same fixtures, same moment, same painter). It renders the
// REAL ScheduleTab / SettingsTab from app/manage/[token]/page.tsx to static HTML (scripts/_render-kit.cjs), paints them
// in WebKit with this tree's compiled .next CSS + Geist, MEASURES the boxes each fix is about and writes cropped PNGs
// plus measure.json to <outDir>. Fixtures only (Pizza Kitchen, GB and US) — nothing reaches a database or the network.
//
// 🔴 RUNS UNCHANGED IN THE BEFORE TREE. The variant patches flip the constants in components/manage/layout-choices.ts;
// where that file does not exist (BEFORE) the variants are skipped and only the base render is made.
//   base  = the constants as committed (PHONE_TIME_PICKER 'select' = 5A; *_STACK_GB false = GB unchanged)
//   gbtoo = SCHEDULE_CARD_STACK_GB and IMPORT_HEADING_STACK_GB true ("AFTER, GB too")
//   pickB = PHONE_TIME_PICKER 'toggle' (5B)
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'node_modules/.cache/uslp-C-out'))
fs.mkdirSync(OUT, { recursive: true })

const SZ = {
  p360: { id: 'p360', w: 360, h: 780 },
  phone: { id: 'phone', w: 390, h: 844 },
  droidtab: { id: 'droidtab', w: 800, h: 1280 },
  ipadp: { id: 'ipadp', w: 810, h: 1080 },
  ipadl: { id: 'ipadl', w: 1180, h: 820 },
  laptop: { id: 'laptop', w: 1280, h: 800 },
}
const MOMENT = { GB: '2026-09-30T10:50:00Z', US: '2026-09-30T15:50:00Z' }
const ZONE = { GB: 'Europe/London', US: 'America/New_York' }

const CHOICES = 'components/manage/layout-choices.ts'
const HAS_CHOICES = fs.existsSync(path.join(REPO, CHOICES))
const VARIANTS = {
  base: [],
  gbtoo: [
    { file: CHOICES, from: 'export const SCHEDULE_CARD_STACK_GB: boolean = false', to: 'export const SCHEDULE_CARD_STACK_GB: boolean = true', optional: true },
    { file: CHOICES, from: 'export const IMPORT_HEADING_STACK_GB: boolean = false', to: 'export const IMPORT_HEADING_STACK_GB: boolean = true', optional: true },
  ],
  pickB: [
    { file: CHOICES, from: "export const PHONE_TIME_PICKER: 'select' | 'toggle' = 'select'", to: "export const PHONE_TIME_PICKER: 'select' | 'toggle' = 'toggle'", optional: true },
  ],
}
const variantsHere = HAS_CHOICES ? Object.keys(VARIANTS) : ['base']

const kit = require('../../_render-kit.cjs')({ cacheTag: 'uslp-C' })
const FIX = require('../../_lp1d2-fixtures.cjs')
const SET = require('../../_lp1d-settings.cjs')
const { CATS, ITEMS, SUBCATS } = require('../../_lp1d-menu.cjs')
const common = require('../../screenshots/common.cjs')
kit.setNow(MOMENT.GB); kit.setDeviceTz(ZONE.GB)
const ctx = FIX.context(kit, REPO)
const { h, states, inManage, PROVIDERS } = ctx

const GB = ctx.GB
const usTime = { ...ctx.US.time, timeZone: ZONE.US }
const US = { ...ctx.US, time: usTime, truck: { ...ctx.US.truck, timezone: ZONE.US, time: usTime } }
const C = { GB, US }

// ── EVENTS (the audit's worst-case values: 11:30–22:45, an event across midnight 20:00–00:30) ──
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

// Which views, in which variants, at which sizes.
const PLAN = {
  'schedule-list': { variants: ['base', 'gbtoo'], sizes: ['phone', 'droidtab', 'ipadp', 'ipadl', 'laptop'] },
  'schedule-list-novan': { variants: ['base', 'gbtoo'], sizes: ['phone', 'droidtab'] },
  'schedule-editor': { variants: ['base', 'pickB'], sizes: ['p360', 'phone', 'droidtab', 'ipadp', 'ipadl', 'laptop'] },
  'schedule-editor-midnight': { variants: ['base', 'pickB'], sizes: ['p360', 'phone', 'droidtab'] },
  'schedule-import': { variants: ['base', 'gbtoo', 'pickB'], sizes: ['phone', 'droidtab'] },
  'settings': { variants: ['base'], sizes: ['phone', 'droidtab', 'laptop'] },
}

async function main() {
  const M_FILE = 'app/manage/[token]/page.tsx'
  const ET = 'components/manage/EventTypes.tsx'
  const SCHED = ['events', 'loadingEvents', 'vans', 'placeTypeChoices', 'editingEvent', 'showImportModal', 'importModalTitle', 'extractedEvents', 'editedEvents',
    'expandedEventIds', 'eventTypeId', 'addMode']
  const SETT = ['firstVanId', 'intervalsAvailable', 'perVanCategoriesAvailable', 'vanCashAvailable', 'settingsExclusionList', 'preordersOn', 'gType', 'gVal', 'gAction', 'gOpen']
  const views = {}   // views[name][variant][cc] = { body, wrap }
  const put = (name, variant, cc, body, wrap = 'tab') => {
    if (typeof body !== 'string' || body.startsWith('ERROR')) throw new Error(`${name}/${variant}/${cc}: ${String(body).slice(0, 400)}`)
    ;((views[name] ||= {})[variant] ||= {})[cc] = { body, wrap }
  }
  const noop = () => {}
  const api = async () => ({})

  for (const variant of variantsHere) {
    const M = await kit.bundle(`uslp-C-${variant}`, [`export { ScheduleTab, SettingsTab } from '@/${M_FILE}'`, PROVIDERS].join('\n'), {
      patches: [
        { file: M_FILE, append: 'export { ScheduleTab, SettingsTab }' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
        { file: M_FILE, states: states(M_FILE, [...new Set([...SCHED, ...SETT])]) },
        { file: ET, states: states(ET, ['types', 'ready', 'usual']) },
        ...VARIANTS[variant],
      ],
    })
    const wants = name => PLAN[name].variants.includes(variant)
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
      if (wants('schedule-list')) put('schedule-list', variant, cc, sched({}))
      if (wants('schedule-list-novan')) put('schedule-list-novan', variant, cc, sched({ vans: [VANS[0]] }))
      const open = eventsFor(cc)[0]
      if (wants('schedule-editor')) put('schedule-editor', variant, cc, sched({ editingEvent: { id: open.id, venue_name: open.venue_name, town: open.town, postcode: open.postcode, address: '', event_date: open.event_date,
        start_time: '11:30', end_time: '22:45', notes: '', truck_id: 'test-truck', van_id: 'v2', is_private: false, private_name: '' }, addMode: 'manual' }), 'modal')
      if (wants('schedule-editor-midnight')) put('schedule-editor-midnight', variant, cc, sched({ editingEvent: { id: 'ev-late', venue_name: 'The Old Crown', town: open.town, postcode: open.postcode, address: '', event_date: '2026-10-02',
        start_time: '20:00', end_time: '00:30', notes: '', truck_id: 'test-truck', van_id: 'v1', is_private: false, private_name: '' }, addMode: 'manual' }), 'modal')
      if (wants('schedule-import')) put('schedule-import', variant, cc, sched({ showImportModal: true, importModalTitle: 'found', extractedEvents: IMPORT(cc), editedEvents: IMPORT(cc), expandedEventIds: new Set(['x1', 'x2']) }), 'modal')
      if (wants('settings')) {
        const items = ITEMS.map((it, i) => ({ ...it, preorder_enabled: i < 3 }))
        const setProps = { userRole: 'owner', truck, whatsappConnection: null, whatsappUsage: null, onConnectionUpdate: noop, token: 'harness', api, showToast: noop,
          onVerifySuccess: noop, onSwitchTab: noop, categories: CATS, items, subcategories: SUBCATS, onTruckUpdate: noop, onItemsPatch: noop, onCategoriesPatch: noop,
          onOpenWalkthrough: noop, notices: null }
        put('settings', variant, cc, ctx.html({ ...sBase, vans: VANS, settingsExclusionList: [], preordersOn: true, gType: 'daily_cutoff', gVal: 765, gAction: 'sold_out', gOpen: '2d' }, W(h(M.SettingsTab, setProps))))
      }
    }
  }
  kit.setDeviceTz(ZONE.GB)

  // ── PAINT AND MEASURE ──
  const css = common.appCss(); const fonts = common.fontClasses(css)
  let current = ''
  const srv = await common.serve(() => current)
  const pageHtml = (cc, v) => {
    const lang = cc === 'US' ? 'en-US' : 'en-GB'
    const inner = `<main class="w-full pb-6 px-4"><div class="manage-tab-pad pt-6">${v.body}</div></main>`
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>html,body{margin:0}</style></head><body class="${fonts} bg-slate-50">${inner}</body></html>`
  }
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const raw = { tree: REPO, hasChoices: HAS_CHOICES, variants: variantsHere, views: {} }
  try {
    for (const cc of ['GB', 'US']) {
      const context = await browser.newContext({ locale: cc === 'US' ? 'en-US' : 'en-GB', timezoneId: ZONE[cc], deviceScaleFactor: 1 })
      const page = await context.newPage()
      for (const [name, byVar] of Object.entries(views)) {
        for (const [variant, byCc] of Object.entries(byVar)) {
          const v = byCc[cc]; if (!v) continue
          current = pageHtml(cc, v)
          await page.setViewportSize({ width: 390, height: 844 })
          await page.goto(srv.url, { waitUntil: 'load' })
          await page.evaluate(() => document.fonts && document.fonts.ready)
          for (const sid of PLAN[name].sizes) {
            const S = SZ[sid]
            await page.setViewportSize({ width: S.w, height: S.h })
            await page.waitForTimeout(60)
            const m = await page.evaluate(MEASURE, name)
            const slot = (((raw.views[name] ||= {})[variant] ||= {})[sid] ||= {})
            slot[cc] = m
            const crops = m.crops ? Object.entries(m.crops).filter(([, c]) => c) : [['', m.crop]]
            const fullH = await page.evaluate(() => document.documentElement.scrollHeight)
            if (!m.fixed && fullH > S.h) await page.setViewportSize({ width: S.w, height: Math.min(fullH, 6000) })
            m.png = {}
            for (let [key, c] of crops) {
              // A crop inside the fixed modal that lies outside the viewport (the editor's Preview on a landscape iPad or a
              // laptop) is scrolled into view inside the modal first, and re-boxed.
              if (m.fixed && key === 'preview' && c) {   // always centred: a sticky footer can cover it even when it is inside the viewport
                const sel = key === 'preview' ? '[data-preview-pane]' : null
                const nb = sel && await page.evaluate(([sl, p]) => { const el = document.querySelector(sl); if (!el) return null; el.scrollIntoView({ block: 'center' })
                  const r = el.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.left) - p), y: Math.max(0, Math.round(r.top) - p), w: Math.round(r.width) + 2 * p, h: Math.round(r.height) + 2 * p } }, [sel, 10])
                if (nb) { c = nb; m.cropsScrolled = { ...(m.cropsScrolled || {}), [key]: nb } }
              }
              const file = `${name}${variant === 'base' ? '' : '@' + variant}${key ? '-' + key : ''}-${S.w}-${cc.toLowerCase()}.png`
              if (c && c.w > 0 && c.h > 0) await page.screenshot({ path: path.join(OUT, file), clip: { x: c.x, y: c.y, width: Math.min(c.w, S.w - c.x), height: c.h } })
              else await page.screenshot({ path: path.join(OUT, file) })
              m.png[key || 'main'] = file
            }
            if (!m.fixed && fullH > S.h) await page.setViewportSize({ width: S.w, height: S.h })
          }
        }
      }
      await context.close()
    }
  } finally { await browser.close(); srv.close() }
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(raw, null, 1))
  console.log(`wrote ${Object.keys(raw.views).length} views (${variantsHere.join(', ')}) to ${OUT}`)
}

// ── THE IN-PAGE MEASURE (runs in WebKit) ──
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
    return { label, aria: s.getAttribute('aria-label'), box: R(s), fontSize: cs.fontSize, avail: Math.round(avail), need: Math.round(need), cut: Math.max(0, Math.round(need - avail)) }
  })
  // AM/PM toggle buttons (5B): each button's text vs its content box.
  const toggles = root => [...root.querySelectorAll('[data-meridiem] button')].filter(vis).map(b => {
    const cs = getComputedStyle(b)
    const avail = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const need = textW(b, b.innerText.trim())
    return { label: b.innerText.trim(), pressed: b.getAttribute('aria-pressed'), box: R(b), avail: Math.round(avail), need: Math.round(need), cut: Math.max(0, Math.round(need - avail)) }
  })
  const pageScrollX = document.documentElement.scrollWidth - window.innerWidth
  const out = { view, vw: window.innerWidth, pageScrollX }

  if (view.startsWith('schedule-list')) {
    const cards = [...document.querySelectorAll('.w-12.flex-shrink-0')].map(dc => dc.closest('.px-4.py-3')).filter(Boolean)
    out.cards = cards.map(card => {
      const details = card.querySelector('.flex-1.min-w-0')
      const venue = details && details.querySelector('p.text-sm.font-bold')
      const time = details && details.querySelector('p.text-sm.font-semibold.text-slate-700')
      const van = details && [...details.querySelectorAll('[data-van-line]')].find(vis)
      const actions = [...card.querySelectorAll('[data-card-actions]')].find(vis) || card.querySelector('.flex.items-start.gap-4 > .flex-shrink-0.self-start')
      const icons = actions ? [...actions.querySelectorAll('button')].filter(vis).length : 0
      return { venue: venue ? venue.textContent : '?', time: time ? time.innerText : null, timeLines: time ? lines(time) : 0, timeBox: time ? R(time) : null,
        van: van ? van.innerText : null, vanLines: van ? lines(van) : 0, vanBox: van ? R(van) : null,
        detailsW: details ? Math.round(details.getBoundingClientRect().width) : 0, actionsBox: actions ? R(actions) : null, icons,
        actionsOver: actions ? actions.scrollWidth - actions.clientWidth : 0,
        cardH: Math.round(card.getBoundingClientRect().height), cardBox: R(card) }
    })
    out.crop = pad(union(cards), 12)
    if (out.crop && out.crop.h > 2400) out.crop.h = 2400
  } else if (view.startsWith('schedule-editor')) {
    const modal = [...document.querySelectorAll('.fixed')].find(vis)
    const startLbl = byText('label', /^Start time/)[0]
    const field = startLbl ? startLbl.parentElement.parentElement : null
    out.fixed = true
    out.fieldRow = field ? R(field) : null
    out.fields = field ? [...field.children].map(col => ({ label: (col.querySelector('label') || {}).innerText, box: R(col), selects: selects(col), toggles: toggles(col),
      over: col.scrollWidth - col.clientWidth })) : []
    out.selectsH = out.fields.flatMap(f => f.selects.map(s => s.box.h))
    const prev = document.querySelector('[data-preview-pane]')
    if (prev && vis(prev)) {
      const p = [...prev.querySelectorAll('p,span,div')].filter(e => vis(e) && /AM|PM|\d{2}:\d{2}/.test(e.textContent || '') && e.children.length === 0)
      out.preview = p.map(e => ({ text: e.innerText, lines: lines(e), box: R(e), w: Math.round(e.getBoundingClientRect().width), need: Math.round(textW(e, e.innerText.replace(/\n/g, ' '))) }))
      out.previewBox = R(prev)
      const card = prev.querySelector('.rounded-xl, .rounded-2xl') || prev
      out.previewCardH = Math.round(card.getBoundingClientRect().height)
    }
    out.crop = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
    out.crops = {
      times: field ? pad(R(field), 12) : null,
      preview: prev && vis(prev) ? pad(R(prev), 10) : null,
    }
  } else if (view === 'schedule-import') {
    const modal = [...document.querySelectorAll('.fixed')].find(vis)
    const inner = modal ? modal.firstElementChild : document.body
    out.fixed = true
    out.headings = [...inner.querySelectorAll('p.text-sm.font-semibold.leading-snug')].filter(vis).map(p => ({ text: p.innerText, lines: lines(p), box: R(p) }))
    out.selects = selects(inner)
    out.toggles = toggles(inner)
    out.innerScrollX = inner.scrollWidth - inner.clientWidth
    const cardOf = p => p.closest('.border.border-slate-200.overflow-hidden')
    const firstCard = out.headings.length ? cardOf([...inner.querySelectorAll('p.text-sm.font-semibold.leading-snug')].filter(vis)[0]) : null
    out.firstCardH = firstCard ? Math.round(firstCard.getBoundingClientRect().height) : null
    out.crop = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
  } else if (view === 'settings') {
    const po = byText('p.text-base.font-bold', /^Pre-orders?/)[0]
    const poCard = po ? po.closest('.p-4') || po.parentElement.parentElement : null
    const timeInput = poCard ? poCard.querySelector('input[type=time]') : null
    const row = timeInput ? timeInput.parentElement.parentElement : null
    const box = row ? row.parentElement : null
    if (row) {
      const typeSel = row.querySelector('select')
      const cs = getComputedStyle(typeSel)
      const label = typeSel.options[typeSel.selectedIndex].text
      out.deadlineRow = { box: R(row), over: row.scrollWidth - row.clientWidth, rowRight: Math.round(row.getBoundingClientRect().right),
        lastRight: Math.round(row.lastElementChild.getBoundingClientRect().right), boxContentRight: Math.round(box.getBoundingClientRect().right - parseFloat(getComputedStyle(box).paddingRight)),
        typeSelect: { label, box: R(typeSel), avail: Math.round(typeSel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), need: Math.round(textW(typeSel, label)) },
        timeBox: R(timeInput), timeOver: timeInput.scrollWidth - timeInput.clientWidth }
      out.deadlineRow.sticksOut = Math.max(0, out.deadlineRow.lastRight - out.deadlineRow.boxContentRight)
    }
    const dl = row ? row.closest('.rounded-xl.border') : null
    out.crop = pad(dl ? R(dl) : (poCard ? R(poCard) : null), 12)
    if (out.crop) out.crop.w = Math.min(out.crop.w + 24, window.innerWidth - out.crop.x)
  }
  return out
}

main().catch(e => { console.error(e); process.exit(1) })
