#!/usr/bin/env node
// scripts/ios/store-shots.cjs — ios-intl-1 Part 5 (9 November 2026; docs/ios-intl-1-report.md §5): the App Store screenshots in every
// listing language, from FIXTURE DATA ONLY (the render kit's stand-in: nothing touches a database, the network or a real truck).
//   node scripts/ios/store-shots.cjs <outDir> [appStoreLocale…]      (needs `npx next build` — the app's compiled CSS and fonts — and
//                                                                      Playwright's WebKit)
// For each locale it writes <outDir>/<locale>/APP_IPHONE_65-{1,2,3}.png (1284×2778, portrait) and APP_IPAD_PRO_3GEN_129-{1,2,3}.png
// (2752×2064, landscape) — the two display types App Store Connect asks this app for (read from the 1.0 version, 9 Nov; the manual's
// V11.35 rule: the account's shelves win over any guide). Alpha channel stripped; one orientation per device.
// The SAME SUBJECTS as the 1.0 English set (read 9 Nov):
//   iPhone 1 · Add order with the "Confirm order" sheet open    iPad 1 · Orders, card grid, with the kitchen-capacity rail
//   iPhone 2 · Orders (one to confirm, then confirmed ones)       iPad 2 · Add order: the menu grid beside the order panel
//   iPhone 3 · Add order: the menu with a basket                  iPad 3 · The kitchen screen (KDS), grid
// rendered as the NATIVE app shows them: the real dashboard and kitchen pages, server-rendered by the render kit in the truck's own
// language, currency and time format, below the status bar's inset, with no purchase prompts (a paid plan, no trial). The seed is a
// HEALTHY service (the manual's V11.35 rule): the event is live, every order is due in the future (no "late" badge), every capacity
// slot green (no over-capacity banner), every order in a status with its action buttons, and the board full.
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '../..')
const { appCss, fontClasses, serve, assertNotPublic } = require('../screenshots/common.cjs')
const { WORDS } = require('./store-words.cjs')
const WF = require('../_world-countries-1-fixtures.cjs')

// App Store locale → the messages locale the app shows, and the fixture country it is photographed in.
const LOCALES = {
  'en-GB': ['en-GB', 'GB'], 'en-US': ['en-US', 'US'], 'en-CA': ['en-CA', 'CA'], 'en-AU': ['en-AU', 'AU'], 'fr-FR': ['fr-FR', 'FR'], 'de-DE': ['de-DE', 'DE'],
  'es-ES': ['es-ES', 'ES'], 'es-MX': ['es-MX', 'MX'], it: ['it-IT', 'IT'], 'pt-PT': ['pt-PT', 'PT'], 'pt-BR': ['pt-BR', 'BR'], 'nl-NL': ['nl-NL', 'NL'],
  sv: ['sv-SE', 'SE'], da: ['da-DK', 'DK'], no: ['nb-NO', 'NO'], fi: ['fi-FI', 'FI'], pl: ['pl-PL', 'PL'], cs: ['cs-CZ', 'CZ'], sk: ['sk-SK', 'SK'],
  hu: ['hu-HU', 'HU'], ro: ['ro-RO', 'RO'], hr: ['hr-HR', 'HR'], 'sl-SI': ['sl-SI', 'SI'], el: ['el-GR', 'GR'], ja: ['ja-JP', 'JP'], 'zh-Hant': ['zh-HK', 'HK'],
  th: ['th-TH', 'TH'], 'ar-SA': ['ar-AE', 'AE'], ms: ['ms-MY', 'MY'],
}
const DEVICES = {
  APP_IPHONE_65: { w: 428, h: 926, scale: 3, sat: 47, sab: 34 },          // 1284×2778
  APP_IPAD_PRO_3GEN_129: { w: 1376, h: 1032, scale: 2, sat: 24, sab: 20 }, // 2752×2064
}
// Prices: a pizza is 9–13 "units"; each currency's unit and rounding, so a menu reads like that country's.
const UNIT = { GBP: [1, 0.5], EUR: [1, 0.5], USD: [1.2, 0.5], CAD: [1.6, 0.5], AUD: [1.8, 0.5], MXN: [22, 5], BRL: [6, 1], SEK: [12, 5], DKK: [8, 5], NOK: [12, 5],
  PLN: [5, 1], CZK: [28, 10], HUF: [450, 50], RON: [5, 1], JPY: [150, 50], HKD: [10, 5], THB: [45, 10], AED: [4.5, 1], MYR: [5.5, 1] }

const names = src => [...new Set([...src.matchAll(/const\s*\[\s*([a-zA-Z]+)\s*,\s*set[A-Za-z]+\s*\]\s*=\s*useState/g)].map(m => m[1]))]
const DASH = 'app/(app)/dashboard/[token]/page.tsx', AOP = 'components/dashboard/AddOrderPanel.tsx', KDS = 'app/(app)/dashboard/[token]/kds/page.tsx'

/** The whole fixture world for one locale. */
function world(asLocale) {
  const [locale, cc] = LOCALES[asLocale]
  const row = WF.rowsWith(WF.WORLD).find(r => r.countryCode === cc)
  const w = WORDS[locale] || WORDS['en-GB']
  const [unit, step] = UNIT[row.currency] || [1, 0.5]
  const price = units => Math.max(step, Math.round((units * unit) / step) * step)
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: row.currency }).resolvedOptions().maximumFractionDigits
  const minor = v => Math.round(v * 10 ** digits)
  const [P, D, S] = w.cat
  const items = [
    ...w.pizzas.map((n, i) => ({ name: n, price: price([10, 12, 13, 13, 11, 13, 9, 12, 11, 12, 12, 13][i % 12]), category: P })),
    ...w.drinks.map((n, i) => ({ name: n, price: price([2.5, 3, 1.5][i]), category: D })),
    ...w.desserts.map((n, i) => ({ name: n, price: price([6, 5][i]), category: S })),
  ].map((x, i) => ({ id: `m${i + 1}`, available: true, modifierGroups: [], ...x }))
  const byName = Object.fromEntries(items.map(i => [i.name, i]))
  const time = { timeZone: row.defaultTimezone, locale: row.locale, timeFormat: row.timeFormat, dateOrder: row.dateOrder, weekStart: row.weekStart }
  const truck = {
    id: 'store-shots-truck', name: w.truck, slug: 'store-shots', mode: 'village', venue_name: null, logo: null, dashboard_token: 'harness', currency: row.currency,
    country: cc, plan: 'pro', feature_overrides: {}, trial_expires_at: null, add_order_layout: 'tabs', takes_cash: true, completion_presses: 'one', kds_mode: false,
    keep_screen_on: true, auto_accept: false, show_paid_step: false, contact_email: 'kitchen@example.test', locale,
    money: { currency: row.currency, locale: row.locale, localeByCountry: { [cc]: row.locale } }, time,
    phone: { phoneCountry: cc, short_name: row.shortName, phone_example: row.phoneExample, phoneCheck: row.phoneCheck },
  }
  // The event is live today, 11:00–15:00 in the country's own time zone; "now" is 11:52 there.
  const date = '2026-11-12'
  const nowUtc = (() => { const guess = new Date(`${date}T11:52:00Z`); const off = new Date(guess.toLocaleString('en-US', { timeZone: row.defaultTimezone })) - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })); return new Date(guess.getTime() - off).toISOString() })()
  const EV = { id: 'ev-1', event_date: date, date, start_time: '11:00', end_time: '15:00', venue_name: w.venue, town: null, truck_id: truck.id, status: 'open', auto_open: true,
    closed_at: null, customer_note: null, van_id: null }
  // [#, slot, status, [item indexes]] — ready ones due in a few minutes, the rest later; three to confirm (the iPad's top row). Nothing late.
  const ROWS = [[31, '11:55', 'ready', [0, 12]], [32, '12:00', 'ready', [1, 2]], [33, '12:05', 'confirmed', [3, 13]], [34, '12:05', 'confirmed', [4]],
    [35, '12:10', 'confirmed', [5, 7, 15]], [36, '12:15', 'pending', [6, 14]], [37, '12:15', 'pending', [8, 9]], [38, '12:20', 'pending', [10, 12]],
    [39, '12:25', 'confirmed', [11, 0, 16]], [40, '12:30', 'confirmed', [2, 3]], [41, '12:35', 'confirmed', [1, 13]], [42, '12:40', 'confirmed', [7, 4]],
    [43, '12:45', 'confirmed', [9, 15]], [44, '12:50', 'confirmed', [0, 5]], [45, '12:55', 'confirmed', [3, 14]]]
  const orders = ROWS.map(([n, slot, status, idx], i) => {
    const counts = {}; for (const k of idx) { const it = items[k]; counts[it.name] = (counts[it.name] || 0) + 1 }
    const list = Object.entries(counts).map(([name, quantity]) => ({ name, quantity, unit_price: byName[name].price, modifiers: [] }))
    const total = list.reduce((s, x) => s + x.quantity * x.unit_price, 0)
    return { id: String(n), order_key: `00000000-0000-4000-8000-0000000003${String(i).padStart(2, '0')}`, customer_name: w.names[i % w.names.length], customer_phone: null,
      customer_email: null, slot, requested_slot: null, asap_estimate: null, event_date: date, event_id: 'ev-1', van_id: null, status, items: list, deals: [], total,
      total_minor: minor(total), food_minor: minor(total), tax_minor: 0, tax_rate_milli: null, tax_inclusive: true, tip_minor: 0, service_fee_minor: 0, notes: null,
      paid_at: null, collected_at: null, created_at: nowUtc, updated_at: nowUtc, placed_at: nowUtc, payment_status: 'unpaid', order_type: 'collection',
      buzzer_number: null, currency: row.currency, country: cc }
  })
  const MENU = { categories: [{ id: 'c1', name: P }, { id: 'c2', name: D }, { id: 'c3', name: S }], items, bundles: [], upsell_rules: [] }
  const itemCategoryMap = Object.fromEntries(items.map(i => [i.name, i.category]))
  const basket = [[0, 1], [3, 1], [5, 1], [12, 2], [15, 1]].map(([k, quantity]) => ({ name: items[k].name, quantity, unit_price: items[k].price, cartKey: items[k].name, modifiers: [] }))
  // Every 5-minute slot from 11:00 to 15:00 open and green, with room to spare.
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const times = Array.from({ length: 48 }, (_, i) => hhmm(11 * 60 + 5 * i))
  const apiSlots = times.map(t => ({ collection_time: t, production_slot: t, available: true, is_past: t < '11:55', is_grace: false, remaining: 6 }))
  const slots = times.filter(t => t >= '11:55').map(t => ({ time: t, slot: t, collection_time: t, available: true, tone: 'green', remaining: 6, label: '', is_past: false }))
  return { locale, cc, row, w, truck, EV, orders, MENU, itemCategoryMap, basket, apiSlots, slots, nowUtc, P, D, S }
}

async function main() {
  const [out, ...only] = process.argv.slice(2)
  if (!out) { console.error('usage: node scripts/ios/store-shots.cjs <outDir> [appStoreLocale…]'); process.exit(2) }
  assertNotPublic(out)
  const kit = require('../_render-kit.cjs')({ cacheTag: 'store-shots' })
  const src = f => fs.readFileSync(path.join(REPO, f), 'utf8')
  const R = await kit.bundle('store-dash', `export { default as Dash } from '@/${DASH}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: DASH, states: names(src(DASH)) }, { file: DASH, from: 'const{token}=use(params)', to: 'const{token}=params' }, { file: AOP, states: names(src(AOP)) }],
  })
  const K = await kit.bundle('store-kds', `export { default as Kds } from '@/${KDS}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, { patches: [{ file: KDS, states: names(src(KDS)) }] })
  const css = appCss(), fonts = fontClasses(css)
  const sharp = require(path.join(REPO, 'node_modules/sharp'))
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const report = {}
  try {
    for (const asLocale of (only.length ? only : Object.keys(LOCALES))) {
      const W = world(asLocale)
      kit.setNow(W.nowUtc); kit.setDeviceTz(W.row.defaultTimezone); kit.setDeviceLocale(W.row.locale)
      const dashState = extra => ({
        truck: W.truck, orders: W.orders, loading: false, authenticated: true, truckMenu: W.MENU, todayEvents: [W.EV], upcomingEvents: [W.EV], selectedEventId: 'ev-1',
        eventsLoaded: true, firstOpenChecked: true, fetchedStockKeys: new Set(['ev-1']), payments: {}, heldAuthorisations: new Set(), paymentFailures: new Set(),
        deviceOnline: true, categoryOrder: [W.P, W.D, W.S], itemCategoryMap: W.itemCategoryMap, categoryConfigs: {}, wakeState: 'held', soundEnabled: true, activeVanCount: 1,
        currentUserEmail: 'kitchen@example.test', slots: W.slots,
        manualItems: W.basket, manualName: W.w.names[15], activeMenuCat: W.P, manualEvent: W.EV, apiSlots: W.apiSlots, eventsLoaded2: true, ...extra,
      })
      const render = (C, props, state) => {
        globalThis.__ms = state; globalThis.__msSearch = ''
        try { return kit.renderStatic(kit.h(C.I18nContext.Provider, { value: { locale: W.locale, setLocale() {} } }, kit.h(props.kds ? C.Kds : C.Dash, props.kds ? { token: 'harness' } : { params: { token: 'harness' } }))) }
        finally { delete globalThis.__ms; delete globalThis.__msSearch }
      }
      const VIEWS = {
        APP_IPHONE_65: [
          ['1', render(R, {}, dashState({ activeTab: 'add', showOrderSheet: true })), 'dark'],
          ['2', render(R, {}, dashState({ activeTab: 'orders' })), 'dark'],
          ['3', render(R, {}, dashState({ activeTab: 'add' })), 'dark'],
        ],
        APP_IPAD_PRO_3GEN_129: [
          ['1', render(R, {}, dashState({ activeTab: 'orders' })), 'dark'],
          ['2', render(R, {}, dashState({ activeTab: 'add' })), 'dark'],
          ['3', render(K, { kds: true }, { truck: { ...W.truck, kds_mode: true }, orders: W.orders, payments: {}, heldAuthorisations: new Set(), paymentFailures: new Set(),
            loading: false, hasLoaded: true, error: null, requiresPin: false, events: [W.EV], selectedEventId: 'ev-1', handoverPref: true, readyPref: true, prefsReconciled: true,
            layoutOverride: 'grid', cardModePref: 'window', showKdsIntro: false, isOffline: false, deviceOnline: true, wakeState: 'held', keepScreenOn: true, soundEnabled: true,
            storedSoundCfg: null, categoryOrder: [W.P, W.D, W.S], itemCategoryMap: W.itemCategoryMap, activeVanCount: 1, phoneOpen: false, deviceOpen: false, pausedUntil: null,
            onlinePausedUntil: null, extraWaitMins: 0, showCookingStep: false }), 'light'],
        ],
      }
      const dir = path.join(out, asLocale); fs.mkdirSync(dir, { recursive: true })
      report[asLocale] = {}
      for (const [type, views] of Object.entries(VIEWS)) {
        const D = DEVICES[type]
        for (const [n, body0, bar] of views) {
          const body = body0.replace(/<img alt="Village Foodie"[^>]*>/g, '').replace(/env\(safe-area-inset-top\)/g, 'var(--sat)').replace(/env\(safe-area-inset-bottom\)/g, 'var(--sab)').replace(/\u270F(?!\uFE0F)/g, '\u270F\uFE0F')
          const dirAttr = /^ar/.test(W.locale) ? ' dir="rtl"' : ''
          const page = () => `<!doctype html><html lang="${W.locale}"${dirAttr} data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>:root{--sat:${D.sat}px;--sab:${D.sab}px}</style></head><body class="${fonts}">${body}</body></html>`
          const srv = await serve(page)
          try {
            const pg = await browser.newPage({ viewport: { width: D.w, height: D.h }, deviceScaleFactor: D.scale, reducedMotion: 'reduce' })
            await pg.goto(srv.url, { waitUntil: 'load' }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(250)
            const m = await pg.evaluate(() => {
              const txt = document.body.innerText || ''
              return { overflowX: document.documentElement.scrollWidth - innerWidth, late: /\blate\b/i.test(txt) && /\d+\s?m(in)?\s+late/i.test(txt), keys: (txt.match(/\b[a-z]+(\.[a-zA-Z]+){1,}\b/g) || []).filter(k => /^(dashboard|addOrder|orders|kds|common|nativeShell)\./.test(k)).slice(0, 5) }
            })
            // the status bar: the time, as an iPhone / iPad shows it, over the app's own header
            await pg.evaluate(({ sat, bar, ipad, timeText }) => {
              const el = document.createElement('div')
              el.style.cssText = `position:fixed;top:0;left:0;right:0;height:${sat}px;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;padding:0 ${ipad ? 22 : 32}px;font:600 ${ipad ? 13 : 16}px -apple-system,system-ui,sans-serif;color:${bar === 'dark' ? '#fff' : '#000'};pointer-events:none`
              const glyph = `<svg width="${ipad ? 52 : 66}" height="12" viewBox="0 0 66 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="1" width="3" height="11" rx="1"/><path d="M30 3.5a9 9 0 0 1 12 0l-1.3 1.4a7 7 0 0 0-9.4 0zm2.6 2.8a5.3 5.3 0 0 1 6.8 0L38 7.7a3.3 3.3 0 0 0-4 0zM36 11.5l-1.6-1.7a2.3 2.3 0 0 1 3.2 0z"/><rect x="45.5" y=".5" width="17" height="11" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="47" y="2" width="14" height="8" rx="1.8"/><rect x="63.5" y="4" width="1.6" height="4" rx=".8" opacity=".45"/></svg>`
              el.innerHTML = `<span>${timeText}</span>${glyph}`
              document.body.appendChild(el)
            }, { sat: D.sat, bar, ipad: type.includes('IPAD'), timeText: new Intl.DateTimeFormat(W.row.locale, { hour: 'numeric', minute: '2-digit', hour12: W.row.timeFormat === '12h', timeZone: 'UTC' }).format(new Date('2026-01-01T11:52:00Z')) })
            const raw = await pg.screenshot()
            await pg.close()
            const file = path.join(dir, `${type}-${n}.png`)
            const img = await sharp(raw).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer()
            fs.writeFileSync(file, img)
            const meta = await sharp(img).metadata()
            report[asLocale][`${type}-${n}`] = { size: `${meta.width}x${meta.height}`, channels: meta.channels, hasAlpha: meta.hasAlpha, ...m }
          } finally { srv.close() }
        }
      }
      console.log(asLocale, JSON.stringify(report[asLocale]))
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1) + '\n')
}
module.exports = { LOCALES, DEVICES, world }
if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
