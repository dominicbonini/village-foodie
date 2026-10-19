#!/usr/bin/env node
// scripts/us-layout-audit/B-ops/render.cjs — US layout audit, group B-ops (truck operations): the REAL operator
// dashboard (app/dashboard/[token]/page.tsx, Orders and + Add order with the real AddOrderPanel) and the REAL
// kitchen screen (app/dashboard/[token]/kds/page.tsx), server-rendered from GB and US fixtures with render-kit
// state patches (the method of scripts/screenshots/dash-us.cjs and kds-us.cjs; nothing reaches a database or the
// network), painted in WebKit with the compiled app CSS at four sizes, and measured in the browser.
//   node scripts/us-layout-audit/B-ops/render.cjs [stateFilter]
//   → docs/us-layout-audit/B-ops/<state>-<WxH>-<gb|us>.png, scripts/us-layout-audit/B-ops/measures.json
const fs = require('fs'); const path = require('path')
const { REPO, appCss, fontClasses, serve } = require('../../screenshots/common.cjs')
const kit = require('../../_render-kit.cjs')({ cacheTag: 'usaudit-B-ops' })
const FX = require('./fixtures.cjs')
const { measure } = require('./measure.cjs')

const OUT = path.join(REPO, 'docs/us-layout-audit/B-ops'); fs.mkdirSync(OUT, { recursive: true })
const SIZES = [[810, 1080, 'ipad-p'], [1180, 820, 'ipad-l'], [800, 1280, 'android'], [1280, 800, 'laptop']]
const D = 'app/dashboard/[token]/page.tsx', AP = 'components/dashboard/AddOrderPanel.tsx', K = 'app/dashboard/[token]/kds/page.tsx'
const names = f => [...new Set([...fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(/const\s*\[\s*([a-zA-Z]+)\s*,\s*set[A-Za-z]+\s*\]\s*=\s*useState/g)].map(m => m[1]))]

// ── the states ──────────────────────────────────────────────────────────────────────────────────────────
const dashBase = (c, ev, evs, orders) => ({
  truck: c.truck, orders, loading: false, authenticated: true, truckMenu: FX.MENU, todayEvents: [], upcomingEvents: evs, selectedEventId: ev.id, eventsLoaded: true,
  firstOpenChecked: true, fetchedStockKeys: new Set([ev.id]), payments: c.payments, heldAuthorisations: new Set(), paymentFailures: new Set(), deviceOnline: true,
  categoryOrder: ['Pizza', 'Sides', 'Drinks', 'Desserts'], itemCategoryMap: c.itemCategoryMap, categoryConfigs: { pizza: { secs: 300, batch: 4 } }, wakeState: 'held',
  soundEnabled: true, activeVanCount: 1, currentUserEmail: 'dana@pizzakitchen.example', slots: c.series(ev.start_time, ev.end_time),
})
const kdsBase = (c, ev, evs, orders, extra = {}) => ({
  truck: { ...c.truck, show_paid_step: true, kds_mode: true }, orders, payments: c.payments, heldAuthorisations: new Set(), paymentFailures: new Set(), loading: false, hasLoaded: true,
  error: null, requiresPin: false, events: evs, selectedEventId: ev.id, handoverPref: true, readyPref: true, prefsReconciled: true, layoutOverride: 'grid', cardModePref: 'window',
  showKdsIntro: false, isOffline: false, deviceOnline: true, wakeState: 'held', keepScreenOn: true, soundEnabled: true, storedSoundCfg: null,
  categoryOrder: ['Pizza', 'Sides', 'Drinks', 'Desserts'], itemCategoryMap: c.itemCategoryMap, activeVanCount: 1, phoneOpen: false, deviceOpen: false, pausedUntil: null,
  onlinePausedUntil: null, extraWaitMins: 0, showCookingStep: false, ...extra,
})
// The midnight event's orders: the same rows, slotted across 20:00–00:30.
const MID_SLOTS = { '1231': '00:15', '1234': '20:15', '1235': '20:45', '1236': '21:30', '1233': '23:45', '1237': '00:30', '1238': '00:00' }
const short = os => os.map(o => ({ ...o, id: String(Number(o.id) - 1200) }))
const midOrders = c => c.orders('ev-2').map(o => ({ ...o, slot: MID_SLOTS[o.id] }))

const STATES = [
  { id: 'dash-orders', tall: true, page: 'dash', surface: 'Dashboard › Orders tab (event bar, order cards, day-load)', state: c => ({ ...dashBase(c, c.EV, [c.EV], c.orders('ev-1')), activeTab: 'orders' }) },
  { id: 'dash-add', page: 'dash', surface: 'Dashboard › + Add order (time picker, basket, event bar)', state: c => ({ ...dashBase(c, c.EV, [c.EV], c.orders('ev-1')), activeTab: 'add',
    manualItems: FX.BASKET, manualName: 'Christopher Montgomery', activeMenuCat: 'Pizza', manualEvent: c.EV, manualSlot: '12:45', apiSlots: c.series(c.EV.start_time, c.EV.end_time) }) },
  { id: 'dash-add-midnight', page: 'dash', surface: 'Dashboard › + Add order, midnight-spanning event (20:00–00:30, not started)', state: c => ({ ...dashBase(c, c.EV_MID, [c.EV, c.EV_MID], midOrders(c)), activeTab: 'add',
    manualItems: FX.BASKET, manualName: 'Christopher Montgomery', activeMenuCat: 'Pizza', manualEvent: c.EV_MID, manualSlot: '00:15', apiSlots: c.series(c.EV_MID.start_time, c.EV_MID.end_time) }) },
  { id: 'dash-orders-midnight', tall: true, page: 'dash', surface: 'Dashboard › Orders tab, midnight-spanning event', state: c => ({ ...dashBase(c, c.EV_MID, [c.EV, c.EV_MID], midOrders(c)), activeTab: 'orders' }) },
  // The longest date line: the same event seen from Sunday 27 September (so it reads the full weekday + month).
  { id: 'dash-longdate', page: 'dash', surface: 'Dashboard › event bar date line (event 3 days out)', now: { GB: '2026-09-27T10:50:00Z', US: '2026-09-27T15:50:00Z' },
    state: c => ({ ...dashBase(c, c.EV, [c.EV], c.orders('ev-1')), activeTab: 'orders' }), crop: 'header' },
  { id: 'dash-prep', page: 'dash', surface: 'Dashboard › Orders tab, Prep list open (start-by times)', state: c => ({ ...dashBase(c, c.EV, [c.EV], c.orders('ev-1')), activeTab: 'orders', showPrepList: true }) },
  { id: 'dash-eventmenu', page: 'dash', surface: 'Dashboard › Manage event menu (date + range)', state: c => ({ ...dashBase(c, c.EV, [c.EV], c.orders('ev-1')), activeTab: 'orders', showEventMenu: true }) },
  { id: 'dash-finishtime', page: 'dash', surface: 'Dashboard › Change event finish time (picker)', state: c => ({ ...dashBase(c, c.EV, [c.EV], c.orders('ev-1')), activeTab: 'orders', finishTimeTarget: { id: 'ev-1', end_time: '22:45', event_date: c.EV.event_date } }) },
  { id: 'dash-completed', page: 'dash', surface: 'Dashboard › Orders tab, Completed list open', state: c => ({ ...dashBase(c, c.EV, [c.EV],
    c.orders('ev-1').map((o, i) => (i < 5 ? { ...o, status: i === 1 ? 'cancelled' : 'collected', collected_at: '2026-09-30T09:45:00.000Z', cancellation_reason: i === 1 ? 'Ran out of dough' : null } : o))),
    activeTab: 'orders', showCompleted: true }) },
  { id: 'dash-eventpicker', page: 'dash', surface: 'Dashboard › + Add order › Select event picker', state: c => {
    const evs = [c.EV, c.EV_MID, { ...c.EV, id: 'ev-3', event_date: '2026-10-07', date: '2026-10-07', venue_name: 'Wednesday Farmers’ Market at Riverside Commons', status: 'confirmed' },
      { ...c.EV_MID, id: 'ev-4', event_date: '2026-10-14', date: '2026-10-14', status: 'confirmed' }]
    return { ...dashBase(c, c.EV, evs, c.orders('ev-1')), activeTab: 'add', manualItems: FX.BASKET, manualName: 'Christopher Montgomery', activeMenuCat: 'Pizza', manualEvent: c.EV,
      apiSlots: c.series(c.EV.start_time, c.EV.end_time), showEventPicker: true, upcomingEvents: evs, eventsLoaded: true, eventsLoading: false } } },
  // Calibration only (no screenshots): the same boards with 2-digit order numbers (a typical per-event counter).
  { id: 'cal2-dash-orders', noShot: true, page: 'dash', surface: 'calibration: dashboard, 2-digit order numbers', state: c => ({ ...dashBase(c, c.EV, [c.EV], short(c.orders('ev-1'))), activeTab: 'orders' }) },
  { id: 'cal2-kds-grid', noShot: true, page: 'kds', surface: 'calibration: KDS Full, 2-digit order numbers', state: c => kdsBase(c, c.EV, [c.EV], short(c.orders('ev-1'))) },
  { id: 'cal2-kds-grid-cook', noShot: true, page: 'kds', surface: 'calibration: KDS Cook, 2-digit order numbers', state: c => kdsBase(c, c.EV, [c.EV], short(c.orders('ev-1')), { cardModePref: 'cook' }) },
  { id: 'kds-grid', tall: true, page: 'kds', surface: 'KDS › grid, Full (window) tickets', state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1')) },
  { id: 'kds-grid-cook', tall: true, page: 'kds', surface: 'KDS › grid, Cook tickets', state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1'), { cardModePref: 'cook' }) },
  { id: 'kds-list', tall: true, page: 'kds', surface: 'KDS › list layout, Full tickets', state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1'), { layoutOverride: 'list' }) },
  { id: 'kds-midnight', tall: true, page: 'kds', surface: 'KDS › midnight-spanning event (Start Event banner, event bar, tickets)', state: c => kdsBase(c, c.EV_MID, [c.EV, c.EV_MID], midOrders(c)) },
  { id: 'kds-longdate', page: 'kds', surface: 'KDS › event bar date line (event 3 days out)', now: { GB: '2026-09-27T10:50:00Z', US: '2026-09-27T15:50:00Z' },
    state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1')), crop: 'header' },
]

;(async () => {
  const only = process.argv[2]
  const R = {
    dash: await kit.bundle('dash', `export { default as Dash } from '@/${D}'\nexport { I18nContext } from '@/lib/i18n/use-t'`,
      { patches: [{ file: D, states: names(D) }, { file: D, from: 'const{token}=use(params)', to: 'const{token}=params' }, { file: AP, states: names(AP) }] }),
    kds: await kit.bundle('kds', `export { default as Kds } from '@/${K}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, { patches: [{ file: K, states: names(K) }] }),
  }
  const css = appCss(); const fonts = fontClasses(css)
  const html = {}
  for (const st of STATES.filter(s => !only || s.id.includes(only))) {
    for (const cc of ['GB', 'US']) {
      const c = FX.country(cc)
      kit.setNow((st.now || FX.NOW)[cc]); kit.setDeviceTz(c.tz); kit.setDeviceLocale(c.locale)
      globalThis.__ms = st.state(c); globalThis.__msSearch = ''
      let body
      try {
        const el = st.page === 'dash' ? kit.h(R.dash.Dash, { params: { token: 'harness' } }) : kit.h(R.kds.Kds, { token: 'harness' })
        body = kit.renderStatic(kit.h(R[st.page].I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, el))
      } finally { delete globalThis.__ms; delete globalThis.__msSearch }
      body = body.replace(/<img alt="Village Foodie"[^>]*>/g, '').replace(/env\(safe-area-inset-top\)/g, '0px')
      html[`${st.id}|${cc}`] = `<!doctype html><html lang="${c.locale}" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="${fonts}">${body}</body></html>`
    }
  }
  if (process.env.DUMP_HTML) for (const [k, v] of Object.entries(html)) fs.writeFileSync(path.join(process.env.DUMP_HTML, k.replace('|', '-') + '.html'), v)
  let cur = ''
  const srv = await serve(() => cur)
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  const measuresFile = path.join(__dirname, 'measures.json')
  const results = fs.existsSync(measuresFile) && only ? JSON.parse(fs.readFileSync(measuresFile, 'utf8')) : {}
  try {
    for (const st of STATES.filter(s => !only || s.id.includes(only))) {
      for (const [w, h, label] of SIZES) {
        for (const cc of ['GB', 'US']) {
          cur = html[`${st.id}|${cc}`]
          const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
          await pg.goto(srv.url, { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(120)
          const m = await pg.evaluate(measure)
          // The slot picker's longest REAL option shapes (AddOrderPanel: mark + time + dot + overload + "{n} {Category}"
          // label + fit suffix; the grace row; ASAP), in this country's clock, measured in the select's own font.
          if (st.id.startsWith('dash-add')) {
            const T = cc === 'US' ? { a: '12:45 PM', b: '10:50 PM', c: '11:50 AM' } : { a: '12:45', b: '22:50', c: '11:50' }
            const labels = [`\u00d7 ${T.a} 🟠❗ 4 Pizza, 2 Drinks · Not enough time`, `\u2007 ${T.a} 🟢 Pizza 4/6`, `⚠️ ${T.b} · After closing`, `⚡ ASAP — ${T.c}`]
            m.synthetic = await pg.evaluate(labels => {
              const s = [...document.querySelectorAll('select')].find(x => x.className.includes('pr-9')); if (!s) return null
              const cs = getComputedStyle(s); const cv = document.createElement('canvas').getContext('2d'); cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
              const content = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
              return { content: Math.round(content), labels: labels.map(t => ({ t, w: Math.round(cv.measureText(t).width) })) }
            }, labels)
          }
          const file = `${st.id}-${w}x${h}-${cc.toLowerCase()}.png`
          const clip = st.crop === 'header' ? { x: 0, y: 0, width: w, height: Math.min(h, 200) } : undefined
          if (!st.noShot) await pg.screenshot({ path: path.join(OUT, file), clip })
          results[`${st.id}|${w}x${h}|${cc}`] = { state: st.id, surface: st.surface, size: `${w}x${h}`, sizeLabel: label, cc, png: `docs/us-layout-audit/B-ops/${file}`, ...m }
          if (st.tall) {   // the whole list: the same width, a taller viewport (widths decide every wrap; heights only fill)
            await pg.setViewportSize({ width: w, height: 1800 }); await pg.waitForTimeout(80)
            await pg.screenshot({ path: path.join(OUT, `${st.id}-full-${w}x${h}-${cc.toLowerCase()}.png`) })
          }
          await pg.close()
        }
      }
      console.log('done', st.id)
    }
  } finally { await browser.close(); srv.close() }
  fs.writeFileSync(measuresFile, JSON.stringify(results, null, 1))
  // Palette-compress the screenshots in place (the brief's size budget); the pixels are unchanged to the eye.
  const sharp = require('sharp')
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.png'))) { const p = path.join(OUT, f); fs.writeFileSync(p, await sharp(p).png({ palette: true, quality: 92, compressionLevel: 9 }).toBuffer()) }
})().catch(e => { console.error(e); process.exit(1) })
