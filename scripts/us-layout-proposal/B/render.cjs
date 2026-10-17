#!/usr/bin/env node
// scripts/us-layout-proposal/B/render.cjs — US layout proposal, group B (dashboard + KDS), fixes 6–10.
// The REAL operator dashboard (app/dashboard/[token]/page.tsx: Orders tab, order cards, kitchen-capacity sidebar)
// and the REAL kitchen screen (app/dashboard/[token]/kds/page.tsx: Full and Cook tickets, grid and list),
// server-rendered from the audit's GB and US fixtures with render-kit state patches (nothing reaches a database or
// the network), painted in WebKit with this tree's compiled CSS (.next/static) at the audit's four sizes, measured
// in the browser (measure.cjs). Adapted from scripts/us-layout-audit/B-ops/render.cjs.
//
//   node scripts/us-layout-proposal/B/render.cjs <outDir> [stateFilter]
//   → <outDir>/<state>-<WxH>-<gb|us>.png (+ -full- for the tall states), <outDir>/measure.json
//
// It runs UNCHANGED in the BEFORE tree and in the proposal worktree. The variant renders flip an exported constant
// at bundle time; when the constant is absent (the BEFORE tree) that variant is skipped, not failed:
//   dash-orders-gbtoo   DAYLOAD_SIDEBAR_WIDE_TIME_GB = true  (fix 9, "AFTER, GB too")
//   kds-*-none          KDS_MONEY_LINES = 'none'             (fix 10(ii); the default 'one' is 10(i))
//   dash-orders-open    the dashboard card's money summary opened (fix 10, the tap)
// FIX1_ONLY=1 renders this tree with OrderCard.tsx and DayLoadStrip.tsx put back to commit 6910127 (fix 1 only):
// the "fix 1 alone" measurements. RAW_PNG=1 skips the palette compression (for an exact GB pixel comparison).
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '../../..')
const { appCss, fontClasses, serve } = require(path.join(REPO, 'scripts/screenshots/common.cjs'))
const FIX1 = !!process.env.FIX1_ONLY
const kit = require(path.join(REPO, 'scripts/_render-kit.cjs'))({ cacheTag: 'usl-proposal-B' + (FIX1 ? '-fix1' : '') })
const FX = require('./fixtures.cjs')
const { measure } = require('./measure.cjs')

const OUT = path.resolve(process.argv[2] || ''); if (!process.argv[2]) { console.error('usage: render.cjs <outDir> [stateFilter]'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })
const only = process.argv[3]
const SIZES = [[810, 1080], [1180, 820], [800, 1280], [1280, 800]]
const D = 'app/dashboard/[token]/page.tsx', AP = 'components/dashboard/AddOrderPanel.tsx', K = 'app/dashboard/[token]/kds/page.tsx'
const OC = 'components/dashboard/OrderCard.tsx', DL = 'components/dashboard/DayLoadStrip.tsx'
const src = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const names = f => [...new Set([...src(f).matchAll(/const\s*\[\s*([a-zA-Z]+)\s*,\s*set[A-Za-z]+\s*\]\s*=\s*useState/g)].map(m => m[1]))]

// The variant switches: [file, from, to]. A switch whose `from` is not in this tree's file is absent here.
const V_GBTOO = [DL, 'export const DAYLOAD_SIDEBAR_WIDE_TIME_GB = false', 'export const DAYLOAD_SIDEBAR_WIDE_TIME_GB = true']
const V_NONE = [OC, "export const KDS_MONEY_LINES: 'one' | 'none' = 'one'", "export const KDS_MONEY_LINES: 'one' | 'none' = 'none'"]
const has = ([f, from]) => !FIX1 && src(f).includes(from)
const sw = ([file, from, to]) => ({ file, from, to, optional: true })
const fix1 = FIX1 ? [OC, DL].map(f => ({ file: f, from: /^[\s\S]*$/, to: () => execFileSync('git', ['show', `6910127:${f}`], { cwd: REPO, encoding: 'utf8' }), optional: true })) : []
const ocStates = FIX1 ? [] : names(OC).filter(n => n === 'chargesOpen')

// ── the states ──────────────────────────────────────────────────────────────────────────────────────────
const dashBase = (c, ev, evs, orders) => ({
  truck: c.truck, orders, loading: false, authenticated: true, truckMenu: FX.MENU, todayEvents: [], upcomingEvents: evs, selectedEventId: ev.id, eventsLoaded: true,
  firstOpenChecked: true, fetchedStockKeys: new Set([ev.id]), payments: c.payments, heldAuthorisations: new Set(), paymentFailures: new Set(), deviceOnline: true,
  categoryOrder: ['Pizza', 'Sides', 'Drinks', 'Desserts'], itemCategoryMap: c.itemCategoryMap, categoryConfigs: { pizza: { secs: 300, batch: 4 } }, wakeState: 'held',
  soundEnabled: true, activeVanCount: 1, currentUserEmail: 'dana@pizzakitchen.example', slots: c.series(ev.start_time, ev.end_time), activeTab: 'orders',
})
const kdsBase = (c, ev, evs, orders, extra = {}) => ({
  truck: { ...c.truck, show_paid_step: true, kds_mode: true }, orders, payments: c.payments, heldAuthorisations: new Set(), paymentFailures: new Set(), loading: false, hasLoaded: true,
  error: null, requiresPin: false, events: evs, selectedEventId: ev.id, handoverPref: true, readyPref: true, prefsReconciled: true, layoutOverride: 'grid', cardModePref: 'window',
  showKdsIntro: false, isOffline: false, deviceOnline: true, wakeState: 'held', keepScreenOn: true, soundEnabled: true, storedSoundCfg: null,
  categoryOrder: ['Pizza', 'Sides', 'Drinks', 'Desserts'], itemCategoryMap: c.itemCategoryMap, activeVanCount: 1, phoneOpen: false, deviceOpen: false, pausedUntil: null,
  onlinePausedUntil: null, extraWaitMins: 0, showCookingStep: false, ...extra,
})
// 2-digit order numbers (a typical per-event counter): the same rows, 1231 → 31.
const short = os => os.map(o => ({ ...o, id: String(Number(o.id) - 1200) }))
const BOTH = ['GB', 'US']

const STATES = [
  // Fixes 8, 9, 10 (dashboard): the Orders tab with 4-digit numbers.
  { id: 'dash-orders', tall: true, page: 'dash', b: 'dash', state: c => dashBase(c, c.EV, [c.EV], c.orders('ev-1')) },
  { id: 'cal2-dash-orders', noShot: true, page: 'dash', b: 'dash', state: c => dashBase(c, c.EV, [c.EV], short(c.orders('ev-1'))) },
  // Fix 10: the summary line opened (a tap). US only: a UK order has no money lines to open.
  { id: 'dash-orders-open', tall: true, page: 'dash', b: 'dash', ccs: ['US'], sizes: [[810, 1080], [1180, 820]], need: () => ocStates.length > 0,
    state: c => ({ ...dashBase(c, c.EV, [c.EV], c.orders('ev-1')), chargesOpen: true }) },
  // Fix 9, "AFTER, GB too": the sidebar constant flipped. GB only (US gets the wide column either way), sidebar sizes.
  { id: 'dash-orders-gbtoo', page: 'dash', b: 'dashGb', ccs: ['GB'], sizes: [[1180, 820], [1280, 800]], need: () => has(V_GBTOO),
    state: c => dashBase(c, c.EV, [c.EV], c.orders('ev-1')) },
  // Fixes 6, 7 and 10 (KDS): Full grid, Cook grid, Full list; 4-digit and 2-digit numbers.
  { id: 'kds-grid', tall: true, page: 'kds', b: 'kds', state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1')) },
  { id: 'kds-grid-cook', tall: true, page: 'kds', b: 'kds', state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1'), { cardModePref: 'cook' }) },
  { id: 'cal2-kds-grid', noShot: true, page: 'kds', b: 'kds', state: c => kdsBase(c, c.EV, [c.EV], short(c.orders('ev-1'))) },
  { id: 'cal2-kds-grid-cook', noShot: true, page: 'kds', b: 'kds', state: c => kdsBase(c, c.EV, [c.EV], short(c.orders('ev-1')), { cardModePref: 'cook' }) },
  { id: 'kds-list', page: 'kds', b: 'kds', state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1'), { layoutOverride: 'list' }) },
  // Fix 10(ii): no money lines on the KDS.
  { id: 'kds-grid-none', page: 'kds', b: 'kdsNone', need: () => has(V_NONE), state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1')) },
  { id: 'kds-list-none', page: 'kds', b: 'kdsNone', need: () => has(V_NONE), state: c => kdsBase(c, c.EV, [c.EV], c.orders('ev-1'), { layoutOverride: 'list' }) },
]

;(async () => {
  const dashPatches = extra => [{ file: D, states: names(D) }, { file: D, from: 'const{token}=use(params)', to: 'const{token}=params' }, { file: AP, states: names(AP) },
    ...(ocStates.length ? [{ file: OC, states: ocStates }] : []), ...fix1, ...extra]
  const kdsPatches = extra => [{ file: K, states: names(K) }, ...fix1, ...extra]
  const dashEntry = `export { default as Dash } from '@/${D}'\nexport { I18nContext } from '@/lib/i18n/use-t'`
  const kdsEntry = `export { default as Kds } from '@/${K}'\nexport { I18nContext } from '@/lib/i18n/use-t'`
  const todo = STATES.filter(s => (!only || s.id.includes(only)) && (!s.need || s.need()))
  const want = new Set(todo.map(s => s.b))
  const B = {}
  if (want.has('dash')) B.dash = await kit.bundle('dash', dashEntry, { patches: dashPatches([]) })
  if (want.has('dashGb')) B.dashGb = await kit.bundle('dashGb', dashEntry, { patches: dashPatches([sw(V_GBTOO)]) })
  if (want.has('kds')) B.kds = await kit.bundle('kds', kdsEntry, { patches: kdsPatches([]) })
  if (want.has('kdsNone')) B.kdsNone = await kit.bundle('kdsNone', kdsEntry, { patches: kdsPatches([sw(V_NONE)]) })
  const css = appCss(); const fonts = fontClasses(css)
  const html = {}
  for (const st of todo) {
    for (const cc of st.ccs || BOTH) {
      const c = FX.country(cc)
      kit.setNow(FX.NOW[cc]); kit.setDeviceTz(c.tz); kit.setDeviceLocale(c.locale)
      globalThis.__ms = st.state(c); globalThis.__msSearch = ''
      let body
      try {
        const R = B[st.b]
        const el = st.page === 'dash' ? kit.h(R.Dash, { params: { token: 'harness' } }) : kit.h(R.Kds, { token: 'harness' })
        body = kit.renderStatic(kit.h(R.I18nContext.Provider, { value: { locale: c.locale, setLocale() {} } }, el))
      } finally { delete globalThis.__ms; delete globalThis.__msSearch }
      body = body.replace(/<img alt="Village Foodie"[^>]*>/g, '').replace(/env\(safe-area-inset-top\)/g, '0px')
      html[`${st.id}|${cc}`] = `<!doctype html><html lang="${c.locale}" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="${fonts}">${body}</body></html>`
    }
  }
  if (process.env.DUMP_HTML) for (const [k, v] of Object.entries(html)) fs.writeFileSync(path.join(process.env.DUMP_HTML, k.replace('|', '-') + '.html'), v)
  let cur = ''
  const srv = await serve(() => cur)
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const mFile = path.join(OUT, 'measure.json')
  const results = only && fs.existsSync(mFile) ? JSON.parse(fs.readFileSync(mFile, 'utf8')) : {}
  const shots = []
  try {
    for (const st of todo) {
      for (const [w, h] of st.sizes || SIZES) {
        for (const cc of st.ccs || BOTH) {
          cur = html[`${st.id}|${cc}`]
          const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
          await pg.goto(srv.url, { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(120)
          const m = await pg.evaluate(measure)
          const file = `${st.id}-${w}x${h}-${cc.toLowerCase()}.png`
          if (!st.noShot && !FIX1) { await pg.screenshot({ path: path.join(OUT, file) }); shots.push(file) }
          results[`${st.id}|${w}x${h}|${cc}`] = { state: st.id, size: `${w}x${h}`, cc, png: st.noShot || FIX1 ? null : file, ...m }
          if (st.tall && !FIX1) {   // the whole board: the same width, a taller viewport (widths decide every wrap)
            await pg.setViewportSize({ width: w, height: 2000 }); await pg.waitForTimeout(80)
            const f2 = `${st.id}-full-${w}x${h}-${cc.toLowerCase()}.png`
            await pg.screenshot({ path: path.join(OUT, f2) }); shots.push(f2)
            results[`${st.id}-full|${w}x${h}|${cc}`] = { state: st.id + '-full', size: `${w}x${h}`, cc, png: f2, ...(await pg.evaluate(measure)) }
          }
          await pg.close()
        }
      }
      console.log('done', st.id)
    }
  } finally { await browser.close(); srv.close() }
  fs.writeFileSync(mFile, JSON.stringify(results, null, 1))
  // Palette-compress the screenshots in place (the pixels are unchanged to the eye).
  const sharp = require(path.join(REPO, 'node_modules/sharp'))
  if (!process.env.RAW_PNG) for (const f of shots) { const p = path.join(OUT, f); fs.writeFileSync(p, await sharp(p).png({ palette: true, quality: 92, compressionLevel: 9 }).toBuffer()) }
})().catch(e => { console.error(e); process.exit(1) })
