// scripts/_midnight-customer.cjs — area "customer" of scripts/midnight-events.cjs: the customer's side of an event that
// runs past midnight (docs/midnight-and-format-fixes-report.md). A MODULE. Every view is the REAL module on fixtures
// (Pizza Kitchen; nothing live), on both codes — BEFORE (692adb4, no lib/event-window.ts) and this tree:
//   page      the order page (app/trucks/[slug]/order/page.tsx), state-patched static render: the closed banner, the
//             "Around …" ASAP text and the times the picker offers — with /api/slots' grid (page), with no slots (the
//             fallback picker and the queue estimate), and with the capacity engine's inputs (fit: the backward fit);
//   list      the same page MOUNTED (scripts/_mini-dom.cjs, effects run): which events its list keeps from a feed;
//   feed      GET /api/events on the fake database: the event ids the customer feed returns;
//   detect    GET /api/menu with no event id: the event the auto-detect picks (the id its event-scoped reads use);
//   cancel    POST /api/orders/cancel: the status for a 00:15 (or 12:45) order with a 20- or 30-minute cut-off;
//   manage    /order/[id]/manage, state-patched: whether the Cancel button shows (isPastCutoff), for the same order.
const path = require('path')

const STUBS = {
  '@/lib/apns': 'export async function sendOrderPendingPush() {}\nexport function normaliseApnsKey(k) { return k }',
  '@/lib/fcm': 'export async function sendOrderPendingPush() {}',
  '@/lib/email': 'export async function sendCancellationEmail() {}\nexport async function sendConfirmationEmail() {}\nexport function formatConfirmationEmail() { return "" }\nexport function formatNewOrderEmail() { return "" }',
  '@/lib/payments/release-hold': 'export async function releaseHoldForTerminalOrder() { return { ok: true } }',
  '@/lib/payments/email-payment-state': 'export async function resolveEmailPaymentState() { return "hatch" }',
}
const OP = 'app/trucks/[slug]/order/page.tsx'
const MP = 'app/order/[id]/manage/page.tsx'
const LATER = { id: 'ev-later', date: '2026-10-03', start_time: '12:00:00', end_time: '15:00:00', venue: 'Harbour Front' }

async function views({ kit, REPO, FIX }) {
  const out = {}
  const safe = async (id, f) => { try { out[id] = await f() } catch (e) { out[id] = 'ERROR ' + String((e && e.message) || e).slice(0, 200) } }
  const SEEDS = require('./_country-settings-gb.cjs')
  const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const { makeFakePg } = require('./_fake-pg.cjs')
  const React = require(path.join(REPO, 'node_modules/react'))
  const h = kit.h

  // ── the real modules ──
  const P = await kit.bundle('mn-cust-page', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'noEvents', 'availableSlots', 'serverCatConfigs', 'capacityInputs', 'formSheetOpen'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const PL = await kit.bundle('mn-cust-list', `export { default as OrderPage } from '@/${OP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const MG = await kit.bundle('mn-cust-manage', `export { default as ManagePage } from '@/${MP}'\nexport { I18nContext } from '@/lib/i18n/use-t'`, {
    patches: [{ file: MP, states: ['order', 'loading'] }],
  })
  const R = await kit.bundle('mn-cust-routes', [
    "export { GET as eventsGET } from '@/app/api/events/route'",
    "export { GET as menuGET } from '@/app/api/menu/[truckId]/route'",
    "export { POST as cancelPOST } from '@/app/api/orders/cancel/route'",
    "export { clearCountrySettingsCache } from '@/lib/country-settings'",
  ].join('\n'), { stubs: STUBS })
  const inLocale = (m, cc, el) => (cc === 'US' ? h(m.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, el) : el)

  // ── fixtures ──
  const hm = t => t.slice(0, 5)
  const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const clock = m => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  /** /api/slots' grid for the event, as the server sends it (canonical, chronological): every 15 min from the start to the
   *  end, then a 30-min grace flagged is_grace. Built here so the page's view does not depend on the engine's generator. */
  const grid = ev => {
    const s = mins(ev.start_time), e0 = mins(ev.end_time), e = e0 < s ? e0 + 1440 : e0
    const rows = []
    for (let m = s; m <= e + 30; m += 15) rows.push({ collection_time: clock(m), available: true, remaining: 10, is_past: false, too_soon: false, is_grace: m > e })
    return rows
  }
  const pageEvent = (ev, extra = {}) => ({ id: 'ev-1', date: '30/09/2026', date_iso: FIX.EVENT_DATE, date_friendly: 'Wednesday 30th September', start_time: hm(ev.start_time), end_time: hm(ev.end_time),
    venue_name: 'Market Square', village: 'Springfield', postcode: 'CB1 1AA', notes: '', status: 'open', collection_interval_mins: 15, ...extra })
  const item = { name: 'Margherita', description: 'Tomato, mozzarella, basil.', price: 10, category: 'Pizza', available: true, dietary: [], allergens: [], modifierGroups: [] }
  const menu = { categories: [{ id: 'c1', name: 'Pizza', prep_secs: 600, batch_size: 4 }], items: [item], upsell_rules: [], bundles: [] }
  const truckOf = cc => ({ id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
    ordering_available: true, card_payments_ready: false, allergen_display_mode: 'per_dish', extra_wait_mins: 0,
    money: { currency: FIX.COUNTRIES[cc].currency, locale: FIX.COUNTRIES[cc].locale }, time: FIX.time(cc),
    phone: { phoneCountry: cc, short_name: cc, phone_example: cc === 'US' ? '(201) 555-0123' : '07400 123456', phoneCheck: 'length' } })
  const CAP = { productionSlotUnits: {}, kitchenCapacity: 8, capacityWindowMins: 5, eventStartMins: 0, reservations: [], batchReservations: false }

  /** The order page's own read-out: the closed banner, the ASAP text and the picker's options (values). */
  const readPage = html => {
    const { text } = kit.textOf(html)
    const closed = /Ordering has closed/.test(text) ? (text.match(/Ordering has closed .*?(?:next time!|\.)/) || ['Ordering has closed'])[0] : null
    const around = (text.match(/Around [0-9:]+(?: [AP]M)?/) || [null])[0]
    const sel = (html.match(/<select[\s\S]*?<\/select>/) || [''])[0]
    const options = [...sel.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].filter(m => m[1]).map(m => `${m[1]}=${m[2]}`)
    return { closed, around, options }
  }
  const renderPage = (cc, ev, extra) => {
    const e = pageEvent(ev)
    globalThis.__ms = { truck: truckOf(cc), menu, events: [e], event: e, eventLoading: false, loading: false, noEvents: false,
      basket: [{ menuItem: item, quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k1' }], appliedDeals: [],
      availableSlots: grid(ev), serverCatConfigs: {}, capacityInputs: null, formSheetOpen: true, ...extra }
    try { return readPage(kit.renderStatic(inLocale(P, cc, h(P.OrderPage, { params: { slug: 'test-kitchen' } })))) } finally { delete globalThis.__ms }
  }

  // ── the mounted page (effects run): the events list it keeps from a feed ──
  const { installMiniDom } = require('./_mini-dom.cjs')
  const { createRoot } = require(path.join(REPO, 'node_modules/react-dom/client'))
  const mountList = async (cc, ev) => {
    const feed = { events: [pageEvent(ev), { ...pageEvent({ start_time: LATER.start_time, end_time: LATER.end_time }), id: LATER.id, date: '03/10/2026', date_iso: LATER.date, venue_name: LATER.venue }], time: FIX.time(cc) }
    const realFetch = globalThis.fetch
    globalThis.fetch = async u => {
      const url = String(u)
      const body = url.startsWith('/api/events') ? feed : url.startsWith('/api/menu') ? { truck: truckOf(cc), menu } : url.startsWith('/api/slots') ? { slots: [], tz: FIX.COUNTRIES[cc].tz } : {}
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)), text: async () => JSON.stringify(body) }
    }
    const dom = installMiniDom(); const root = createRoot(dom.container)
    // The page listens on window (scroll, focus); the mini DOM's window is globalThis, which has no listener registry.
    const hadListener = typeof globalThis.addEventListener === 'function'
    if (!hadListener) { globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {} }
    try {
      await kit.quietAsync(async () => {
        await React.act(async () => { root.render(inLocale(PL, cc, h(PL.OrderPage, { params: { slug: 'test-kitchen' } }))) })
        await React.act(async () => { await new Promise(r => setTimeout(r, 20)) })
      })
      const text = dom.container.textContent
      return ['Market Square', LATER.venue].filter(v => text.includes(v))
    } finally {
      await kit.quietAsync(async () => React.act(async () => root.unmount())); dom.teardown(); globalThis.fetch = realFetch
      if (!hadListener) { delete globalThis.addEventListener; delete globalThis.removeEventListener }
    }
  }

  // ── the routes, on the fake database ──
  const tables = (cc, ev, over = {}) => ({
    trucks: [{ id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', active: true, plan: 'pro', country: cc, currency: FIX.COUNTRIES[cc].currency, timezone: FIX.COUNTRIES[cc].tz,
      time_selection_enabled: true, mode: 'village', allow_customer_cancellation: true, cancellation_cutoff_mins: 30 }],
    country_settings: [snake(SEEDS.gbFromSeed()), snake({ ...SEEDS.usFromSeed(), enabled: true })],
    truck_events: [FIX.eventRow('ev-1', ev), FIX.eventRow(LATER.id, { start_time: LATER.start_time, end_time: LATER.end_time }, { event_date: LATER.date, venue_name: LATER.venue })],
    menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 10, category_id: 'c1', category: 'Pizza', available: true, is_active: true }],
    menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizza', prep_secs: 600, batch_size: 4 }],
    modifier_groups: [], modifier_options: [], item_modifier_groups: [], bundles_db: [], event_deals: [], orders: [], ...over,
  })
  const route = async (db, fn) => {
    globalThis.__harnessDb = db
    R.clearCountrySettingsCache?.()
    try { return await kit.quietAsync(fn) } finally { delete globalThis.__harnessDb }
  }
  const get = url => new NextRequest(`http://127.0.0.1${url}`)
  const post = (url, body) => new NextRequest(`http://127.0.0.1${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  /** The fake database, with every event id an event-scoped read names recorded (the menu auto-detect's pick). */
  const recording = t => {
    const db = makeFakePg(t); const seen = []
    const from = name => {
      const q = db.from(name)
      if (name !== 'truck_events' && name !== 'event_deals') return q
      const eq = q.eq
      q.eq = (k, v) => { if ((name === 'truck_events' && k === 'id') || k === 'event_id') seen.push(v); return eq(k, v) }
      return q
    }
    return { db: { ...db, from }, seen }
  }
  const order = (cc, ev, slot, cutoff) => ({ order_key: 'ok-1', id: '41', truck_id: 'test-truck', event_id: 'ev-1', status: 'confirmed', slot, event_date: FIX.EVENT_DATE,
    customer_email: null, customer_name: 'Sam', total: 10, payment_status: 'unpaid', items: [], deals: [], currency: FIX.COUNTRIES[cc].currency, country: cc,
    trucks: { name: 'Pizza Kitchen', allow_customer_cancellation: true, cancellation_cutoff_mins: cutoff, timezone: FIX.COUNTRIES[cc].tz, country: cc },
    truck_events: { start_time: ev.start_time, end_time: ev.end_time } })
  const manage = (cc, ev, slot, cutoff) => {
    globalThis.__ms = { loading: false, order: { id: '41', status: 'confirmed', customer_name: 'Sam', slot, event_date: FIX.EVENT_DATE, event_start_time: ev.start_time, event_end_time: ev.end_time,
      items: [], deals: [], total: 10, payment_status: 'unpaid', truck_name: 'Pizza Kitchen', venue_name: 'Market Square', allow_cancellation: true, cancellation_cutoff_mins: cutoff,
      money: { currency: FIX.COUNTRIES[cc].currency, locale: FIX.COUNTRIES[cc].locale }, time: FIX.time(cc) } }
    try { return /Cancel order/.test(kit.textOf(kit.renderStatic(inLocale(MG, cc, h(MG.ManagePage)))).text) ? 'cancel-button' : 'no-button' } finally { delete globalThis.__ms }
  }

  // MIDNIGHT FOLLOW-UPS (17 October 2026): 'extended' — a normal 18:00–23:30 event whose finish was changed to 00:30 in the
  // finish-time modal (decision 2); it is then an overnight event and ordering must stay open to 00:30.
  for (const [kind, ev, moments] of [['normal', FIX.NORMAL, FIX.NORMAL_MOMENTS], ['midnight', FIX.MIDNIGHT, FIX.MIDNIGHT_MOMENTS], ['extended', FIX.EXTENDED, FIX.MIDNIGHT_MOMENTS]]) {
    // The order whose cut-off is tested: 00:15 on the overnight event (the NEXT day's), 12:45 on the normal one.
    const slot = kind === 'normal' ? '12:45' : '00:15'
    for (const cc of ['GB', 'US']) {
      const tz = FIX.COUNTRIES[cc].tz
      kit.setDeviceTz(tz); kit.setDeviceLocale(FIX.COUNTRIES[cc].locale)
      // The extra cancel moments: just inside and just outside each cut-off, around the order's slot.
      const extra = kind === 'normal'
        ? [['12:20', FIX.EVENT_DATE, '12:20'], ['12:30', FIX.EVENT_DATE, '12:30']]
        : [['23:40', FIX.EVENT_DATE, '23:40'], ['23:56', FIX.EVENT_DATE, '23:56']]
      for (const [label, ymd, hhmm] of [...moments, ...extra]) {
        kit.setNow(FIX.utcOf(cc, ymd, hhmm))
        const p = `${kind}|${cc}|${label}`
        const core = moments.some(m => m[0] === label)
        if (core) {
          await safe(`${p}|page`, () => renderPage(cc, ev, {}))
          await safe(`${p}|fallback`, () => renderPage(cc, ev, { availableSlots: [] }))
          await safe(`${p}|fit`, () => renderPage(cc, ev, { serverCatConfigs: { pizza: { secs: 600, batch: 4 } }, capacityInputs: { ...CAP, eventStartMins: mins(ev.start_time) } }))
          await safe(`${p}|list`, () => mountList(cc, ev))
          await safe(`${p}|feed`, async () => {
            const res = await route(makeFakePg(tables(cc, ev)), () => R.eventsGET(get('/api/events?truck=test-kitchen')))
            const b = await res.json()
            return { status: res.status, events: (b.events || []).map(e => `${e.id}@${e.date_iso}`), next: b.next_event ? b.next_event.id : null }
          })
          await safe(`${p}|detect`, async () => {
            const { db, seen } = recording(tables(cc, ev))
            const res = await route(db, () => R.menuGET(get('/api/menu/test-kitchen'), { params: Promise.resolve({ truckId: 'test-kitchen' }) }))
            const b = await res.json()
            return { status: res.status, event: seen[0] ?? null, ordering_available: b.truck ? b.truck.ordering_available : null }
          })
        }
        for (const cutoff of [20, 30]) {
          await safe(`${p}|cancel-${cutoff}`, async () => {
            const res = await route(makeFakePg(tables(cc, ev, { orders: [order(cc, ev, slot, cutoff)] })), () => R.cancelPOST(post('/api/orders/cancel', { order_key: 'ok-1' })))
            const b = await res.json()
            return `${res.status} ${b.code || (b.ok ? 'ok' : '')}`
          })
          await safe(`${p}|manage-${cutoff}`, () => manage(cc, ev, slot, cutoff))
        }
      }
    }
  }
  return out
}

function checks(t, A, B) {
  const v = (cc, m, w) => A[`midnight|${cc}|${m}|${w}`]
  // ── MIDNIGHT FOLLOW-UPS · decision 2: the 18:00–23:30 event extended to 00:30 in the finish-time modal ──
  for (const cc of ['GB', 'US']) {
    const x = (m, w) => A[`extended|${cc}|${m}|${w}`]
    t(`customer ${cc}: the event extended to 00:30 stays OPEN at 19:00, 23:50 and 00:15 (next day) and is closed at 00:31`,
      ['19:00', '23:50', '00:15'].every(m => x(m, 'page') && x(m, 'page').closed === null) && /Ordering has closed/.test((x('00:31', 'page') || {}).closed || ''),
      ['19:00', '23:50', '00:15', '00:31'].map(m => `${m}: ${JSON.stringify(x(m, 'page') && x(m, 'page').closed)}`).join(' | '))
  }
  const opts = x => (x && Array.isArray(x.options) ? x.options.map(o => o.split('=')[0]) : [])
  for (const cc of ['GB', 'US']) {
    // The closed banner (isEventClosed): open while the event runs — 19:00 is before it, so not closed either — closed after 00:30.
    t(`customer ${cc}: ordering is OPEN at 19:00, 23:50 and 00:15 (next day); the closed banner shows at 00:31 and the next afternoon`,
      ['19:00', '23:50', '00:15'].every(m => v(cc, m, 'page') && v(cc, m, 'page').closed === null) && ['00:31', 'next-afternoon'].every(m => v(cc, m, 'page') && /Ordering has closed/.test(v(cc, m, 'page').closed || '')),
      ['19:00', '23:50', '00:15', '00:31', 'next-afternoon'].map(m => `${m}: ${JSON.stringify(v(cc, m, 'page') && v(cc, m, 'page').closed)}`).join(' | '))
    t(`customer ${cc}: the closed banner names the end in the truck's style (00:30 / 12:30 AM)`,
      (v(cc, '00:31', 'page').closed || '').includes(cc === 'GB' ? '00:30' : '12:30 AM'), v(cc, '00:31', 'page').closed)
    t(`customer ${cc}: BEFORE (contrast) closed the event at 23:50 — the bug`, /closed/.test(JSON.stringify(B[`midnight|${cc}|23:50|page`] || '')), JSON.stringify(B[`midnight|${cc}|23:50|page`]).slice(0, 200))
    // The offered times.
    const at2350 = opts(v(cc, '23:50', 'page'))
    t(`customer ${cc}: at 23:50 the picker offers 00:00, 00:15 and 00:30 (after midnight), nothing past, nothing in the grace`,
      ['00:00', '00:15', '00:30'].every(s => at2350.includes(s)) && !at2350.some(s => s >= '20:00' && s <= '23:45') && !at2350.includes('00:45'), at2350.join(' '))
    t(`customer ${cc}: at 23:50 the 00:15 option reads ${cc === 'GB' ? '00:15' : '12:15 AM'}`, (v(cc, '23:50', 'page').options || []).includes(`00:15=${cc === 'GB' ? '00:15' : '12:15 AM'}`), (v(cc, '23:50', 'page').options || []).join(' '))
    const at0015 = opts(v(cc, '00:15', 'page'))
    t(`customer ${cc}: at 00:15 (next day) it offers 00:15 and 00:30 only`, JSON.stringify(at0015) === JSON.stringify(['00:15', '00:30']), at0015.join(' '))
    t(`customer ${cc}: at 19:00 it offers the whole evening, 20:00 … 00:30, in order`, (() => { const o = opts(v(cc, '19:00', 'page')); return o[0] === '20:00' && o[o.length - 1] === '00:30' && o.length === 19 })(), opts(v(cc, '19:00', 'page')).join(' '))
    // ASAP text — never "24:xx", and sensible at 23:50 (the first slot after now: 00:00).
    const asapAll = ['19:00', '23:50', '00:15'].flatMap(m => ['page', 'fallback', 'fit'].map(w => (v(cc, m, w) || {}).around)).filter(Boolean)
    t(`customer ${cc}: no ASAP text ever reads 24:xx`, asapAll.length > 0 && asapAll.every(a => !/\b24:/.test(a)), asapAll.join(' | '))
    t(`customer ${cc}: ASAP at 23:50 is ${cc === 'GB' ? '00:00' : '12:00 AM'} (the first open slot), at 00:15 it is ${cc === 'GB' ? '00:15' : '12:15 AM'}`,
      v(cc, '23:50', 'page').around === `Around ${cc === 'GB' ? '00:00' : '12:00 AM'}` && v(cc, '00:15', 'page').around === `Around ${cc === 'GB' ? '00:15' : '12:15 AM'}`, [v(cc, '23:50', 'page').around, v(cc, '00:15', 'page').around])
    // The queue estimate (no slots): now + one 10-minute pizza cycle, on the clock.
    t(`customer ${cc}: the queue estimate (no slots from the server) at 23:50 is ${cc === 'GB' ? '00:00' : '12:00 AM'}, at 00:15 it is ${cc === 'GB' ? '00:25' : '12:25 AM'} (now + a 10-min cycle, never 24:xx)`,
      v(cc, '23:50', 'fallback').around === `Around ${cc === 'GB' ? '00:00' : '12:00 AM'}` && v(cc, '00:15', 'fallback').around === `Around ${cc === 'GB' ? '00:25' : '12:25 AM'}`, [v(cc, '23:50', 'fallback').around, v(cc, '00:15', 'fallback').around])
    const fb = opts(v(cc, '23:50', 'fallback'))
    t(`customer ${cc}: the fallback picker at 23:50 walks past midnight — 00:00 … 00:55 offered (the hour runs on), nothing before 00:00`,
      fb.includes('00:00') && fb.includes('00:15') && fb.includes('00:30') && !fb.some(s => s >= '20:00'), fb.join(' '))
    // The backward fit, fed on the engine clock: 00:15 fits at 23:50 (its cooking window 00:05–00:15 is ahead of now).
    const fit = opts(v(cc, '23:50', 'fit'))
    t(`customer ${cc}: with the capacity engine on, 00:15 fits at 23:50 and ASAP is ${cc === 'GB' ? '00:00' : '12:00 AM'}`, fit.includes('00:15') && fit.includes('00:30') && v(cc, '23:50', 'fit').around === `Around ${cc === 'GB' ? '00:00' : '12:00 AM'}`, `${fit.join(' ')} · ${v(cc, '23:50', 'fit').around}`)
    // The events list (mounted page) and the routes.
    t(`customer ${cc}: the order page's list keeps the event at 23:50 and 00:15, drops it at 00:31`,
      v(cc, '23:50', 'list').includes('Market Square') && v(cc, '00:15', 'list').includes('Market Square') && !v(cc, '00:31', 'list').includes('Market Square') && v(cc, '00:31', 'list').includes('Harbour Front'),
      ['23:50', '00:15', '00:31'].map(m => `${m}: ${JSON.stringify(v(cc, m, 'list'))}`).join(' | '))
    t(`customer ${cc}: /api/events still returns the event at 00:15 (next day), not at 00:31`,
      v(cc, '00:15', 'feed').events.includes(`ev-1@${'2026-09-30'}`) && v(cc, '00:15', 'feed').next === 'ev-1' && !v(cc, '00:31', 'feed').events.includes('ev-1@2026-09-30') && v(cc, '00:31', 'feed').next === 'ev-later',
      ['23:50', '00:15', '00:31'].map(m => `${m}: ${JSON.stringify(v(cc, m, 'feed'))}`).join(' | '))
    t(`customer ${cc}: /api/menu's auto-detect picks the event at 23:50 and 00:15 (next day), the next one at 00:31`,
      v(cc, '23:50', 'detect').event === 'ev-1' && v(cc, '00:15', 'detect').event === 'ev-1' && v(cc, '00:31', 'detect').event === 'ev-later',
      ['23:50', '00:15', '00:31'].map(m => `${m}: ${JSON.stringify(v(cc, m, 'detect'))}`).join(' | '))
    // Cancel: a 00:15 order's cut-off is 00:15 on the NEXT day minus the window.
    t(`customer ${cc}: cancel a 00:15 order, 20-min cut-off (23:55): allowed at 23:40 and 23:50, refused at 23:56 and 00:15 — route and manage page agree`,
      ['23:40', '23:50'].every(m => v(cc, m, 'cancel-20') === '200 ok' && v(cc, m, 'manage-20') === 'cancel-button') && ['23:56', '00:15'].every(m => /^409 cancel_window_passed/.test(v(cc, m, 'cancel-20')) && v(cc, m, 'manage-20') === 'no-button'),
      ['23:40', '23:50', '23:56', '00:15'].map(m => `${m}: ${v(cc, m, 'cancel-20')} / ${v(cc, m, 'manage-20')}`).join(' | '))
    t(`customer ${cc}: cancel a 00:15 order, 30-min cut-off (23:45): allowed at 23:40, refused at 23:50 — route and manage page agree`,
      v(cc, '23:40', 'cancel-30') === '200 ok' && v(cc, '23:40', 'manage-30') === 'cancel-button' && /^409/.test(v(cc, '23:50', 'cancel-30')) && v(cc, '23:50', 'manage-30') === 'no-button',
      ['23:40', '23:50'].map(m => `${m}: ${v(cc, m, 'cancel-30')} / ${v(cc, m, 'manage-30')}`).join(' | '))
    t(`customer ${cc}: BEFORE (contrast) refused the 00:15 order's cancel at 19:00 — it read 00:15 on the event's own date`,
      /^409/.test(B[`midnight|${cc}|19:00|cancel-20`] || ''), B[`midnight|${cc}|19:00|cancel-20`])
  }
}

module.exports = { views, checks }
