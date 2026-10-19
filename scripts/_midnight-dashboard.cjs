// scripts/_midnight-dashboard.cjs — events that run past midnight, area "dashboard" (run by scripts/midnight-events.cjs).
// The operator surfaces, for a GB truck (London, 24-hour) and a US truck (New York, 12-hour), at each moment of
// scripts/_midnight-fixtures.cjs, for the NORMAL 11:30–22:45 event and the MIDNIGHT 20:00–00:30 one:
//   card       OrderCard's countdown / late label for each order (rendered; the label the card computed)
//   dash       the dashboard page rendered: its order sequence (pending, then confirmed), the prep list (current batch
//              and coming up), the event its cards are bound to, and finishEvent's "finishing early?" verdict
//   kds        the KDS page rendered: its board order, and finishEvent's verdict
//   add        AddOrderPanel rendered: the slots it offers, its ASAP label, the "This event has ended" banner
//   strip      DayLoadStrip rendered (the times it lists)
//   finish     finishTimeOptions + ordersDueAfter (the finish-time modal's two exports)
//   upcoming   /api/events/manage?upcoming=true on a fake database
//   default    pickDefaultEventByTime — the KDS's and the dashboard's default event
//   action     /api/events/action `update` writing an end time (the midnight event only)
// and, under `format|`, the two US-format views (a US change on the normal event, so not a `normal|` view): the dashboard's
// Completed row and the finish-time modal's words. GB must be byte-identical to BEFORE there; US reads 12-hour.
// Fixtures only: Pizza Kitchen ('test-truck'). Nothing reaches a database or the network.
const path = require('path'); const fs = require('fs')

const DASH = 'app/dashboard/[token]/page.tsx'
const KDS = 'app/dashboard/[token]/kds/page.tsx'
const CARD = 'components/dashboard/OrderCard.tsx'
const ADD = 'components/dashboard/AddOrderPanel.tsx'
const FINISH = 'components/shared/EventFinishTimeModal.tsx'

// OrderCard reports the label it computed for itself (the same `offsetLabel` it renders) — a patch on a line both
// codes carry.
const CARD_SPY = { file: CARD, from: 'const isLate = !!slotDt && slotOffset >= 1',
  to: 'const isLate = !!slotDt && slotOffset >= 1; if (globalThis.__mnCards) globalThis.__mnCards.push({ name: order.customer_name, slot: order.slot, label: offsetLabel, late: isLate })' }
const MS_USE_OLD = "const __msUse = (k, p) => (globalThis.__ms && Object.prototype.hasOwnProperty.call(globalThis.__ms, k) ? [globalThis.__ms[k], p[1]] : p);"
const MS_USE_REC = "const __msUse = (k, p) => { const v = globalThis.__ms && Object.prototype.hasOwnProperty.call(globalThis.__ms, k) ? globalThis.__ms[k] : p[0]; " +
  "return [v, x => { if (globalThis.__mnSets && globalThis.__mnRec && globalThis.__mnRec.has(k)) globalThis.__mnSets.push([k, typeof x === 'function' ? '[fn]' : x]); return p[1](x) }] };"

const DASH_STATES = ['truck', 'orders', 'loading', 'authenticated', 'truckMenu', 'todayEvents', 'upcomingEvents', 'selectedEventId', 'eventsLoaded',
  'firstOpenChecked', 'payments', 'heldAuthorisations', 'showCompleted', 'fetchedStockKeys', 'deviceOnline', 'showPrepList', 'categoryConfigs', 'finishConfirm']
const KDS_STATES = ['truck', 'orders', 'payments', 'heldAuthorisations', 'paymentFailures', 'loading', 'hasLoaded', 'error', 'requiresPin', 'events',
  'selectedEventId', 'handoverPref', 'readyPref', 'prefsReconciled', 'layoutOverride', 'cardModePref', 'showKdsIntro', 'isOffline', 'deviceOnline',
  'wakeState', 'keepScreenOn', 'soundEnabled', 'storedSoundCfg', 'finishConfirm']
const ADD_STATES = ['manualItems', 'manualEvent', 'apiSlots', 'apiCapacityInputs', 'apiCatConfigs', 'upcomingEvents', 'eventsLoaded']

// The dashboard's child components are stand-ins (as scripts/_lp1b-dashboard.cjs does): a stub renders its props as JSON,
// so the order sequence and the event each card is bound to are read from what the page HANDS OrderCard.
const REAL = new Set(['@/components/dashboard/types', '@/components/dashboard/helpers', '@/components/MoneyContext'])
function componentStubs(src) {
  const stubs = {}
  for (const mm of src.matchAll(/^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*'(@\/components\/[^']+)'/gm)) {
    const [, def, named, spec] = mm
    if (REAL.has(spec)) continue
    const names = (named || '').split(',').map(x => x.trim()).filter(x => x && !x.startsWith('type ')).map(x => x.split(/\s+as\s+/)[0])
    stubs[spec] = names.map(n => `export const ${n} = props => globalThis.__mnStub(${JSON.stringify(n)}, props)`).join('\n') +
      (def ? `\nexport default props => globalThis.__mnStub(${JSON.stringify(def)}, props)` : '')
  }
  return stubs
}
const unescape = s => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** The outerHTML of the first <div …> whose opening tag starts with `open`, balanced. */
function divFrom(html, open) {
  const i = html.indexOf(open)
  if (i < 0) return null
  let d = 0; const re = /<div\b|<\/div>/g; re.lastIndex = i
  for (let m; (m = re.exec(html));) { d += m[0] === '</div>' ? -1 : 1; if (d === 0) return html.slice(i, m.index + 6) }
  return html.slice(i)
}

async function views({ kit, REPO, FIX }) {
  const h = kit.h
  const out = {}
  const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
  const LP = require('./_lp1b-fixtures.cjs')
  const SEEDS = require('./_country-settings-gb.cjs')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const React = require(path.join(REPO, 'node_modules/react'))
  const text = html => kit.textOf(html).text

  globalThis.__mnStub = (name, props) => {
    const data = {}
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'children' || typeof v === 'function' || React.isValidElement(v)) continue
      data[k] = v instanceof Set ? [...v] : v instanceof Map ? [...v] : v
    }
    return React.createElement('x-stub', { 'data-c': name, 'data-p': JSON.stringify(data) })
  }
  const I18N = "export { I18nContext } from '@/lib/i18n/use-t'\nexport { MoneyProvider } from '@/components/MoneyContext'\n"
  const B = {
    parts: await kit.bundle('mn-dash-parts', `export { OrderCard } from '@/${CARD}'
export { DayLoadStrip } from '@/components/dashboard/DayLoadStrip'
export { AddOrderPanel } from '@/${ADD}'
export { EventFinishTimeModal, finishTimeOptions, ordersDueAfter } from '@/${FINISH}'
export { pickDefaultEventByTime } from '@/lib/time-utils'
${I18N}`, { patches: [CARD_SPY, { file: ADD, states: ADD_STATES }, { file: FINISH, states: ['selected', 'step'] }] }),
    dash: await kit.bundle('mn-dash-page', `export { default as Dash } from '@/${DASH}'\n${I18N}`, {
      patches: [
        { file: DASH, states: DASH_STATES }, { file: DASH, from: MS_USE_OLD, to: MS_USE_REC },
        { file: DASH, from: 'const{token}=use(params)', to: 'const{token}=params' },
        { file: DASH, from: 'const finishEvent=(eventId:string)=>{', to: 'const finishEvent=(globalThis.__mnH||={}).finishEvent=(eventId:string)=>{' },
      ],
      stubs: componentStubs(read(DASH)),
    }),
    kds: await kit.bundle('mn-dash-kds', `export { default as Kds } from '@/${KDS}'\n${I18N}`, {
      patches: [
        CARD_SPY, { file: KDS, states: KDS_STATES }, { file: KDS, from: MS_USE_OLD, to: MS_USE_REC },
        { file: KDS, from: 'const finishEvent = (eventId: string) => {', to: 'const finishEvent = (globalThis.__mnH||={}).finishEvent = (eventId: string) => {' },
      ],
    }),
    routes: await kit.bundle('mn-dash-routes', `export { GET as manageGET } from '@/app/api/events/manage/route'
export { POST as actionPOST } from '@/app/api/events/action/route'
export { clearCountrySettingsCache } from '@/lib/country-settings'`, {
      stubs: { '@/lib/email': 'export const sendEventCancellationEmail = async () => {}\nexport const sendConfirmationEmail = async () => {}' },
    }),
  }
  const P = B.parts

  const wrap = (m, cc, C, el) => {
    let e = h(m.MoneyProvider, { fmt: C.fmt }, el)
    if (cc === 'US') e = h(m.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, e)
    return e
  }
  const render = (state, el, search) => {
    globalThis.__ms = state
    if (search != null) globalThis.__msSearch = search
    try { return kit.quiet(() => kit.renderStatic(el)) } finally { delete globalThis.__ms; delete globalThis.__msSearch }
  }
  const safe = async (id, fn) => { try { out[id] = await fn() } catch (e) { out[id] = 'ERROR ' + String(e && e.stack || e).slice(0, 400) } }
  const fmtM = m => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

  const SCEN = {
    normal: { times: FIX.NORMAL, moments: FIX.NORMAL_MOMENTS, slots: ['22:30', '12:15', '18:00', '22:45'], done: '17:00', proposals: ['21:00', '22:45', '23:30'] },
    midnight: { times: FIX.MIDNIGHT, moments: FIX.MIDNIGHT_MOMENTS, slots: ['00:15', '23:45', '20:30', '00:05'], done: '00:10', proposals: ['23:00', '00:00', '00:30'] },
    // MIDNIGHT FOLLOW-UPS (17 October 2026): a normal 18:00–23:30 event whose finish was changed to 00:30 in the finish-time
    // modal (decision 2) — an overnight event from then on.
    extended: { times: FIX.EXTENDED, moments: FIX.MIDNIGHT_MOMENTS, slots: ['00:15', '23:45', '20:30', '00:05'], done: '00:10', proposals: ['23:00', '00:00', '00:30'] },
  }
  const STATUS = ['pending', 'pending', 'confirmed', 'confirmed']

  for (const cc of ['GB', 'US']) {
    const C = LP.country(cc)
    const TS = FIX.time(cc)
    const tz = TS.timeZone
    const TRUCK = { ...C.TRUCK, time: TS }
    const tpl = C.ORDERS.card_paid
    for (const [scen, S] of Object.entries(SCEN)) {
      const EV = FIX.eventRow(scen === 'normal' ? 'ev-n' : 'ev-m', S.times, { status: 'open', venue_address: null, address: null, opened_at: null, closed_at: null, customer_note: null })
      const NEXT = FIX.eventRow('ev-next', { start_time: '12:00:00', end_time: '14:00:00' }, { event_date: FIX.NEXT_DATE, venue_name: 'The Green', status: 'confirmed' })
      const order = (slot, status, i) => ({ ...tpl, id: String(100 + i), order_key: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
        customer_name: `Cust ${slot}`, slot, asap_estimate: null, requested_slot: null, event_date: FIX.EVENT_DATE, event_id: EV.id, status,
        items: [{ name: `Pizza ${slot}`, quantity: 1, unit_price: 10, modifiers: [] }], deals: [], notes: null, total: 10, total_minor: 1000,
        created_at: `2026-09-30T1${i}:00:00.000Z`, updated_at: '2026-09-30T18:00:00.000Z', placed_at: `2026-09-30T1${i}:00:00.000Z`,
        collected_at: status === 'collected' ? '2026-09-30T23:00:00.000Z' : null, payment_status: 'paid' })
      const live = S.slots.map((sl, i) => order(sl, STATUS[i], i))
      const collected = order(S.done, 'collected', 9)
      const MENU = { categories: [{ id: 'c1', name: 'Pizzas', prep_secs: 600, batch_size: 1, sort_order: 0, subcategories: [], modifierGroups: [] }],
        items: [...S.slots, S.done].map((sl, i) => ({ id: `i${i}`, name: `Pizza ${sl}`, price: 10, category: 'Pizzas', available: true, modifierGroups: [] })), bundles: [], upsell_rules: [] }
      const catCfg = { pizzas: { secs: 600, batch: 1 } }
      const startM = mins(S.times.start_time), endM = mins(S.times.end_time)
      const grid = []; for (let m = startM; m <= (endM < startM ? endM + 1440 : endM); m += 15) grid.push(fmtM(m))
      const SLOTS = grid.map(t => ({ collection_time: t, production_slot: t, current_orders: 0, max_orders: 10, available: true, tone: 'green', label: '' }))
      const EVREC = { id: EV.id, event_date: EV.event_date, start_time: EV.start_time, end_time: EV.end_time, venue_name: EV.venue_name, town: EV.town, status: 'confirmed' }

      for (const [moment, ymd, hhmm] of S.moments) {
        kit.setNow(FIX.utcOf(cc, ymd, hhmm)); kit.setDeviceTz(tz)
        const id = what => `${scen}|${cc}|${moment}|${what}`

        // ── OrderCard: the label each card computed (rendered statically) ──
        await safe(id('card'), () => live.map(o => {
          globalThis.__mnCards = []
          try {
            render(null, wrap(P, cc, C, h(P.OrderCard, { order: o, truck: TRUCK, event: EV, slots: [], actionLoading: null, onAction() {}, onEdit() {}, catConfigs: catCfg, itemCategoryMap: {} })))
            return globalThis.__mnCards[0] || null
          } finally { delete globalThis.__mnCards }
        }))

        // ── the dashboard page ──
        const dashBase = { truck: TRUCK, orders: [...live, collected], loading: false, authenticated: true, truckMenu: MENU, todayEvents: [EV], upcomingEvents: [EV],
          selectedEventId: EV.id, eventsLoaded: true, firstOpenChecked: true, payments: {}, heldAuthorisations: new Set(), showCompleted: true,
          fetchedStockKeys: new Set([EV.id]), deviceOnline: true, showPrepList: true, categoryConfigs: catCfg }
        const dashEl = () => wrap(B.dash, cc, C, h(B.dash.Dash, { params: { token: 'harness' } }))
        let dashHtml = ''
        await safe(id('dash'), async () => {
          globalThis.__mnH = {}
          dashHtml = render(dashBase, dashEl())
          const cards = [...dashHtml.matchAll(/data-c="OrderCard" data-p="([^"]*)"/g)].map(m => JSON.parse(unescape(m[1])))
          const prep = divFrom(dashHtml, '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">')
          const H = globalThis.__mnH
          globalThis.__mnSets = []; globalThis.__mnRec = new Set(['finishConfirm'])
          try { kit.quiet(() => H.finishEvent(EV.id)) } finally { delete globalThis.__mnRec }
          const finish = globalThis.__mnSets.map(([, v]) => v); delete globalThis.__mnSets; delete globalThis.__mnH
          return { order: cards.map(c => c.order && c.order.customer_name), eventOfCards: [...new Set(cards.map(c => c.event && c.event.id))],
            prep: prep ? text(prep) : null, finishEarly: finish.length ? finish[0].early : null }
        })
        // with nothing selected: the event the page resolves by itself (pickDefaultEventByTime over its list)
        await safe(id('dashDefault'), () => {
          const html = render({ ...dashBase, selectedEventId: null, upcomingEvents: [EV, NEXT] }, dashEl())
          const cards = [...html.matchAll(/data-c="OrderCard" data-p="([^"]*)"/g)].map(m => JSON.parse(unescape(m[1])))
          return [...new Set(cards.map(c => c.event && c.event.id))]
        })
        // the Completed row (a US format fix — a `format|` view on the normal event, so GB stays compared byte for byte)
        await safe(scen === 'normal' ? `format|${cc}|${moment}|completed` : id('completed'), () => {
          if (!dashHtml) return null
          return [...dashHtml.matchAll(/🕐 (?:<!-- -->)?([^<]*)</g)].map(m => m[1])
        })

        // ── the KDS page ──
        await safe(id('kds'), () => {
          globalThis.__mnCards = []; globalThis.__mnH = {}
          try {
            const st = { truck: TRUCK, orders: live, payments: {}, heldAuthorisations: new Set(), paymentFailures: new Set(), loading: false, hasLoaded: true, error: null,
              requiresPin: false, events: [EV], selectedEventId: EV.id, handoverPref: true, readyPref: null, prefsReconciled: true, layoutOverride: 'list', cardModePref: null,
              showKdsIntro: false, isOffline: false, deviceOnline: true, wakeState: 'off', keepScreenOn: true, soundEnabled: true, storedSoundCfg: null }
            render(st, wrap(B.kds, cc, C, h(B.kds.Kds, { token: 'harness' })), 'van_id=v1&van_name=Van 1')
            const board = globalThis.__mnCards.map(c => c.slot)
            const H = globalThis.__mnH
            globalThis.__mnSets = []; globalThis.__mnRec = new Set(['finishConfirm'])
            try { kit.quiet(() => H.finishEvent(EV.id)) } finally { delete globalThis.__mnRec }
            const finish = globalThis.__mnSets.map(([, v]) => v)
            return { board, finishEarly: finish.length ? finish[0].early : null }
          } finally { delete globalThis.__mnCards; delete globalThis.__mnSets; delete globalThis.__mnH }
        })

        // ── AddOrderPanel ──
        await safe(id('add'), () => {
          const props = { truck: TRUCK, truckMenu: MENU, menuGroups: { Pizzas: MENU.items }, itemStocks: [], categoryStocks: [], categoryConfigs: catCfg, categoryAllowNotes: {},
            orders: [], waitMinutes: 0, token: 'harness', pin: '', todayEvent: EVREC, categoryOrder: ['Pizzas'], itemCategoryMap: {}, showToast() {}, onOrderPlaced() {},
            controlledEvent: EVREC, isActive: true, vanTakesCash: null }
          const st = { manualEvent: EVREC, eventsLoaded: true, upcomingEvents: [EVREC], apiSlots: SLOTS, apiCatConfigs: catCfg,
            manualItems: [{ name: `Pizza ${S.slots[0]}`, quantity: 1, unit_price: 10, modifiers: [], cartKey: 'k1' }],
            apiCapacityInputs: { productionSlotUnits: {}, kitchenCapacity: null, capacityWindowMins: 5, intervalMins: 15, eventStartMins: startM, eventEndMins: null,
              earliestCollectionMins: 0, date: FIX.EVENT_DATE, nowMins: 0, windowSecs: 0, reservations: [], batchReservations: false } }
          const html = render(st, wrap(P, cc, C, h(P.AddOrderPanel, props)))
          const asap = /<option value=""[^>]*>([^<]*)<\/option>/.exec(html)
          return { slots: [...html.matchAll(/<option value="(\d\d:\d\d)"/g)].map(m => m[1]), asap: asap ? unescape(asap[1]) : null,
            ended: /This event has ended/.test(unescape(html)) }
        })

        // ── DayLoadStrip ──
        await safe(id('strip'), () => text(render(null, wrap(P, cc, C, h(P.DayLoadStrip, { slots: SLOTS, eventDate: EV.event_date, event: EV, variant: 'sidebar', time: TS })))))

        // ── the finish-time modal's two exports ──
        await safe(id('finish'), () => ({
          options: P.finishTimeOptions(EV.event_date, tz, EV),
          dueAfter: Object.fromEntries(S.proposals.map(p => [p, P.ordersDueAfter([...live, collected], p, EV)])),
        }))
        // ── the default event (KDS seed + the dashboard's no-selection resolution) ──
        await safe(id('default'), () => (P.pickDefaultEventByTime([EV, NEXT], tz) || {}).id ?? null)

        // ── /api/events/manage?upcoming=true ──
        await safe(id('upcoming'), async () => {
          const ydate = '2026-09-29'
          const rows = [EV, NEXT, FIX.eventRow('ev-yday', S.times, { event_date: ydate, venue_name: 'Yesterday' })]
          globalThis.__harnessDb = kit.fakeDb({
            trucks: [{ id: 'test-truck', dashboard_token: 'harness', timezone: tz, country: cc }],
            country_settings: [SEEDS.gbFromSeed(), SEEDS.usFromSeed()].map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))),
            truck_events: rows,
          })
          B.routes.clearCountrySettingsCache?.()
          try {
            const res = await kit.quietAsync(() => B.routes.manageGET(new NextRequest('http://127.0.0.1/api/events/manage?token=harness&upcoming=true')))
            const body = await res.json()
            return { status: res.status, ids: (body.events || []).map(e => e.id) }
          } finally { delete globalThis.__harnessDb }
        })

        // ── the finish-time modal's words (US format fix): a `format|` view on the normal event ──
        if (moment === S.moments[1][0] || moment === S.moments[2][0]) {
          for (const [step, selected] of [['pick', null], ['confirm', S.proposals[0]]]) {
            await safe(scen === 'normal' ? `format|${cc}|${moment}|modal-${step}` : id(`modal-${step}`), () => {
              const html = render({ step, ...(selected ? { selected } : {}) }, wrap(P, cc, C,
                h(P.EventFinishTimeModal, { event: EV, orders: [...live, collected], time: TS, onClose() {}, onConfirm() {} })))
              return { text: text(html), options: [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m => `${m[1]}=${unescape(m[2])}`) }
            })
          }
        }
      }

      // ── /api/events/action `update` writing an end time (no clock involved: one run per scenario) ──
      for (const [k, end] of Object.entries(scen === 'midnight' ? { overnight: '00:30', same: '20:00', extend: '01:00' } : { later: '23:00', earlier: '21:00' })) {
        await safe(`${scen}|${cc}|${S.moments[0][0]}|action-${k}`, async () => {
          const writes = []
          globalThis.__harnessDb = kit.fakeDb({
            trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', plan: 'pro', feature_overrides: {}, trial_expires_at: null, dashboard_token: 'harness', timezone: tz, country: cc }],
            country_settings: [SEEDS.gbFromSeed(), SEEDS.usFromSeed()].map(r => Object.fromEntries(Object.entries(r).map(([kk, v]) => [kk.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))),
            truck_events: [EV],
          }, writes)
          B.routes.clearCountrySettingsCache?.()
          try {
            const res = await kit.quietAsync(() => B.routes.actionPOST(new NextRequest('http://127.0.0.1/api/events/action', { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token: 'harness', action: 'update', eventId: EV.id, payload: { end_time: end } }) })))
            const body = await res.json()
            return { status: res.status, body: { ...body, ...(body.error ? { error: '…' } : {}) }, wrote: writes.filter(w => w.op === 'update').map(w => w.patch.end_time) }
          } finally { delete globalThis.__harnessDb }
        })
      }
    }

    // ── MIDNIGHT FOLLOW-UPS · decision 2: the finish-time modal on a NORMAL 18:00–23:30 event, at 23:00 ──
    {
      const EVN = FIX.eventRow('ev-f', { start_time: '18:00:00', end_time: '23:30:00' }, { status: 'open', venue_address: null, address: null, opened_at: null, closed_at: null, customer_note: null })
      kit.setNow(FIX.utcOf(cc, FIX.EVENT_DATE, '23:00')); kit.setDeviceTz(tz)
      await safe(`fu|${cc}|23:00|finish`, () => ({ options: P.finishTimeOptions(EVN.event_date, tz, EVN) }))
      for (const [step, selected] of [['pick', null], ['confirm', '00:30'], ['confirm-same', '23:15']]) {
        await safe(`fu|${cc}|23:00|modal-${step}`, () => {
          const html = render({ step: step.startsWith('confirm') ? 'confirm' : 'pick', ...(selected ? { selected } : {}) }, wrap(P, cc, C,
            h(P.EventFinishTimeModal, { event: EVN, orders: [], time: TS, onClose() {}, onConfirm() {} })))
          return { text: text(html), options: [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m => `${m[1]}=${unescape(m[2])}`) }
        })
      }
      // Choosing 00:30: the update route saves it (the event is then 18:00–00:30 — the 'extended' scenario above).
      await safe(`fu|${cc}|23:00|action-0030`, async () => {
        const writes = []
        globalThis.__harnessDb = kit.fakeDb({
          trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', plan: 'pro', feature_overrides: {}, trial_expires_at: null, dashboard_token: 'harness', timezone: tz, country: cc }],
          country_settings: [SEEDS.gbFromSeed(), SEEDS.usFromSeed()].map(r => Object.fromEntries(Object.entries(r).map(([kk, v]) => [kk.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))),
          truck_events: [EVN],
        }, writes)
        B.routes.clearCountrySettingsCache?.()
        try {
          const res = await kit.quietAsync(() => B.routes.actionPOST(new NextRequest('http://127.0.0.1/api/events/action', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: 'harness', action: 'update', eventId: EVN.id, payload: { end_time: '00:30' } }) })))
          return { status: res.status, wrote: writes.filter(w => w.op === 'update').map(w => w.patch.end_time) }
        } finally { delete globalThis.__harnessDb }
      })
    }
  }
  delete globalThis.__mnStub
  return out
}

function checks(t, A, B) {
  const g = (k) => A[k]
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  for (const cc of ['GB', 'US']) {
    const m = (moment, what) => g(`midnight|${cc}|${moment}|${what}`)
    const cardOf = (moment, slot) => (m(moment, 'card') || []).find(c => c && c.slot === slot) || null
    // OrderCard: 00:15 is "in 25m" at 23:50, due at 00:15, late after
    t(`${cc} OrderCard: a 00:15 order at 23:50 reads "in 25m", not late`, eq(cardOf('23:50', '00:15'), { name: 'Cust 00:15', slot: '00:15', label: 'in 25m', late: false }), [cardOf('23:50', '00:15'), 'BEFORE', (B[`midnight|${cc}|23:50|card`] || [])[0]])
    t(`${cc} OrderCard: at 00:15 the 00:15 order is "now"; at 00:31 it is 16m late`, cardOf('00:15', '00:15')?.label === 'now' && cardOf('00:31', '00:15')?.label === '16m late' && cardOf('00:31', '00:15')?.late === true, [cardOf('00:15', '00:15'), cardOf('00:31', '00:15')])
    t(`${cc} OrderCard: at 23:50 the 23:45 order is 5m late (before midnight, unchanged reading)`, cardOf('23:50', '23:45')?.label === '5m late', cardOf('23:50', '23:45'))
    // dashboard order sort
    t(`${cc} dashboard: orders run 23:45 before 00:15 (pending) and 20:30 before 00:05 (confirmed)`, eq(m('23:50', 'dash')?.order, ['Cust 23:45', 'Cust 00:15', 'Cust 20:30', 'Cust 00:05']), m('23:50', 'dash'))
    t(`${cc} dashboard: finishing at 23:50 / 00:15 is EARLY (ends 00:30 the next day); at 00:31 it is not`, m('23:50', 'dash')?.finishEarly === true && m('00:15', 'dash')?.finishEarly === true && m('00:31', 'dash')?.finishEarly === false,
      ['23:50', m('23:50', 'dash')?.finishEarly, '00:15', m('00:15', 'dash')?.finishEarly, '00:31', m('00:31', 'dash')?.finishEarly])
    // prep list batches
    const prep = (moment) => m(moment, 'dash')?.prep || ''
    const split = s => { const i = s.indexOf('Coming up'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)] }
    {
      const [now, later] = split(prep('23:50'))
      t(`${cc} prep list at 23:50: 23:45 in the current batch; 00:05 and 00:15 are coming up, in that order`,
        /Pizza 23:45/.test(now) && !/Pizza 00:05|Pizza 00:15/.test(now) && later.indexOf('00:05') >= 0 && later.indexOf('00:05') < later.indexOf('00:15'), prep('23:50'))
      const [now2] = split(prep('00:15'))
      t(`${cc} prep list at 00:15: 00:05 and 00:15 are now in the current batch`, /Pizza 00:05/.test(now2) && /Pizza 00:15/.test(now2), prep('00:15'))
    }
    // AddOrderPanel
    const add = (moment) => m(moment, 'add') || {}
    t(`${cc} Add order at 23:50: not ended; offers 00:00, 00:15 and 00:30 (after midnight), not 23:45`, add('23:50').ended === false && ['00:00', '00:15', '00:30'].every(s => add('23:50').slots?.includes(s)) && !add('23:50').slots?.includes('23:45'), add('23:50'))
    t(`${cc} Add order at 00:15: not ended; offers 00:15 and 00:30`, add('00:15').ended === false && eq(add('00:15').slots, ['00:15', '00:30']), add('00:15'))
    t(`${cc} Add order at 00:31 and the next afternoon: "This event has ended"`, add('00:31').ended === true && add('next-afternoon').ended === true, [add('00:31'), add('next-afternoon')])
    t(`${cc} Add order at 19:00: not ended; offers the whole night, 20:00 … 00:30, in order`, add('19:00').ended === false && add('19:00').slots?.[0] === '20:00' && add('19:00').slots?.slice(-3).join() === '00:00,00:15,00:30', add('19:00'))
    // DayLoadStrip
    const want = cc === 'US' ? ['12:00 AM', '12:15 AM', '12:30 AM'] : ['00:00', '00:15', '00:30']
    t(`${cc} day-load strip at 23:50 lists the post-midnight slots in order`, typeof m('23:50', 'strip') === 'string' && want.every((w, i, a) => m('23:50', 'strip').indexOf(w) >= 0 && (i === 0 || m('23:50', 'strip').indexOf(a[i - 1]) < m('23:50', 'strip').indexOf(w))) && !/23:45|11:45 PM/.test(m('23:50', 'strip')), m('23:50', 'strip'))
    t(`${cc} day-load strip at 00:15 lists 00:15 and 00:30 only (not the whole night)`, typeof m('00:15', 'strip') === 'string' && m('00:15', 'strip').indexOf(want[1]) >= 0 && m('00:15', 'strip').indexOf(want[2]) >= 0 && m('00:15', 'strip').indexOf(want[0]) < 0 && !/20:|8:00 PM/.test(m('00:15', 'strip')), m('00:15', 'strip'))
    // KDS
    t(`${cc} KDS board at 23:50: 20:30, 23:45, 00:05, 00:15`, eq(m('23:50', 'kds')?.board, ['20:30', '23:45', '00:05', '00:15']), m('23:50', 'kds'))
    t(`${cc} KDS: finishing at 23:50 / 00:15 is EARLY; at 00:31 it is not`, m('23:50', 'kds')?.finishEarly === true && m('00:15', 'kds')?.finishEarly === true && m('00:31', 'kds')?.finishEarly === false, [m('23:50', 'kds'), m('00:15', 'kds'), m('00:31', 'kds')])
    // finish-time options + ordersDueAfter
    const fin = moment => m(moment, 'finish') || {}
    t(`${cc} finish times at 23:50 start at 00:00 (next day) and include 00:30`, fin('23:50').options?.[0] === '00:00' && fin('23:50').options.includes('00:30'), fin('23:50').options?.slice(0, 4))
    // ⚠️ RE-PINNED (follow-ups, 17 October 2026): the start itself (20:00) is no longer offered — the editor's rule.
    t(`${cc} finish times at 19:00 run 20:15 … 23:45, then 00:00 … (the start, 20:00, is not offered)`, fin('19:00').options?.[0] === '20:15' && !fin('19:00').options.includes('20:00') && fin('19:00').options.indexOf('00:00') === fin('19:00').options.indexOf('23:45') + 1, fin('19:00').options?.slice(0, 3))
    t(`${cc} orders due after: 23:00 → 3 (23:45, 00:05, 00:15), 00:00 → 2, 00:30 → 0`, eq(fin('23:50').dueAfter, { '23:00': 3, '00:00': 2, '00:30': 0 }), fin('23:50').dueAfter)
    // events/manage upcoming
    const up = moment => (m(moment, 'upcoming') || {}).ids || []
    t(`${cc} /api/events/manage upcoming keeps the event at 23:50 and at 00:15 the next day`, up('23:50').includes('ev-m') && up('00:15').includes('ev-m'), [up('23:50'), up('00:15'), 'BEFORE 00:15', (B[`midnight|${cc}|00:15|upcoming`] || {}).ids])
    t(`${cc} /api/events/manage upcoming drops it at 00:31 and the next afternoon, and never lists yesterday's event`, !up('00:31').includes('ev-m') && !up('next-afternoon').includes('ev-m') && ['19:00', '23:50', '00:15', '00:31'].every(k => !up(k).includes('ev-yday')), [up('00:31'), up('next-afternoon')])
    // today's event until it ends
    t(`${cc} default event (KDS seed / dashboard) at 00:15 is still the midnight event`, m('00:15', 'default') === 'ev-m' && eq(m('00:15', 'dashDefault'), ['ev-m']), [m('00:15', 'default'), m('00:15', 'dashDefault')])
    t(`${cc} default event at 00:31 moves on to the next one`, m('00:31', 'default') === 'ev-next', m('00:31', 'default'))
    // the update route
    const act = k => g(`midnight|${cc}|19:00|action-${k}`) || {}
    t(`${cc} /api/events/action update: an overnight end (00:30, 01:00) is saved; an end equal to the start is refused (400)`,
      act('overnight').status === 200 && eq(act('overnight').wrote, ['00:30']) && act('extend').status === 200 && act('same').status === 400 && eq(act('same').wrote, []),
      [act('overnight'), act('extend'), act('same')])
    // US format
    if (cc === 'US') {
      // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-1-nbsp: each 12-hour time carries U+00A0 before AM/PM (NB) in the
      // Completed row and in the picker's option LABELS; the `text` views are whitespace-collapsed (kit.textOf), so they
      // still read an ASCII space and their checks are unchanged.
      const NB = '\u00A0'
      t('US Completed row reads 12-hour ("12:10 AM" on the midnight event, "5:00 PM" on the normal one; U+00A0 before AM/PM)', eq(m('23:50', 'completed'), [`12:10${NB}AM`]) && eq(g('format|US|12:00|completed'), [`5:00${NB}PM`]),
        [m('23:50', 'completed'), g('format|US|12:00|completed'), 'BEFORE', B['format|US|12:00|completed']])
      const pick = m('23:50', 'modal-pick') || {}, conf = m('23:50', 'modal-confirm') || {}
      t('US finish-time modal writes 12-hour: "currently set to finish at 12:30 AM", options "12:30 AM", "Keep 12:30 AM"',
        // ⚠️ RE-PINNED (follow-ups): a next-day time now says so — "12:30 AM (next day)".
        /finish at 12:30 AM \(next day\)/.test(pick.text) && (pick.options || []).includes(`00:30=12:30${NB}AM (next day) (current)`) && /Keep 12:30 AM \(next day\)/.test(conf.text) && /finish at 11:00 PM instead of 12:30 AM \(next day\)/.test(conf.text), [pick.text, (pick.options || []).slice(0, 4), conf.text])
      const npick = g('format|US|12:00|modal-pick') || {}
      t('US finish-time modal on the normal event: "10:45 PM", option values still "HH:MM"', /finish at 10:45 PM/.test(npick.text) && (npick.options || []).includes(`22:45=10:45${NB}PM (current)`), [npick.text, (npick.options || []).slice(0, 3)])
    } else {
      // ⚠️ RE-PINNED (follow-ups): the picker's option list is a NAMED change (decision 2 — `named` below); the rest is BEFORE's.
      for (const k of Object.keys(A).filter(k => k.startsWith('format|GB|')))
        t(`GB ${k} is byte-identical to BEFORE${/modal-pick/.test(k) ? ' + the named finish-option change' : ''}`, eq(A[k], named(k, B[k])), [A[k], named(k, B[k])])
      const pick = m('23:50', 'modal-pick') || {}
      t('GB finish-time modal on the midnight event: "00:30 (next day)", first option 00:00 (next day)', /finish at 00:30 \(next day\)/.test(pick.text) && (pick.options || [])[0] === '00:00=00:00 (next day)', [pick.text, (pick.options || []).slice(0, 3)])
    }
  }
}

// Module-level copies for `named` (the views keep their own): the fixtures, minute-of-day, and "HH:MM".
const FIX = require('./_midnight-fixtures.cjs')
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const fmtM = m => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/* ══ MIDNIGHT FOLLOW-UPS (17 October 2026, Dominic's decision 2, docs/midnight-followups-report.md) ══════════════════════
 * The finish-time modal offers the editor's end times on EVERY event: every 15-minute boundary EXCEPT the start; one after the
 * start on the event's date, one EARLIER than the start on the next day — kept while still ahead of "now", in event order.
 * `named` rebuilds BEFORE's normal-event list (and the GB picker's text) from that rule, computed here from the fixtures'
 * clock (utcOf), not from the product. The "due after" counts (same-day proposals) stay BEFORE's exactly. */
function ruleFinishOptions(cc, ymd, hhmm, start) {
  const now = Date.parse(FIX.utcOf(cc, ymd, hhmm)), s = mins(start), out = []
  for (let m = 0; m < 1440; m += 15) {
    if (m === s) continue
    const t = fmtM(m)
    if (Date.parse(FIX.utcOf(cc, m < s ? FIX.NEXT_DATE : FIX.EVENT_DATE, t)) > now) out.push(t)
  }
  return out.sort((a, b) => (mins(a) < s ? mins(a) + 1440 : mins(a)) - (mins(b) < s ? mins(b) + 1440 : mins(b)))
}
function named(id, before) {
  // ⚠️ NAMED, 18 October 2026 — us-layout-fix-1-nbsp (lib/time-utils.ts clockOf; /Users/dominicbonini/dev/usl-out/REPIN-BRIEF.md):
  // Add Order's ASAP option on the US normal event ("⚡ ASAP — 11:30 AM" → U+00A0 before AM/PM). The `slots` values are
  // BEFORE's exactly; GB: none.
  if (/^normal\|US\|[^|]+\|add$/.test(id) && before && typeof before.asap === 'string') return { ...before, asap: before.asap.replace(/(\d{1,2}:\d{2}) (AM|PM)$/, '$1\u00A0$2') }
  const m = /^(normal|format)\|(GB|US)\|([^|]+)\|(finish|modal-pick)$/.exec(id)
  if (!m || (m[1] === 'normal') !== (m[4] === 'finish') || (m[1] === 'format' && m[2] !== 'GB')) return before
  const moment = FIX.NORMAL_MOMENTS.find(x => x[0] === m[3])
  if (!moment || !before || typeof before !== 'object') return before
  const start = FIX.NORMAL.start_time, opts = ruleFinishOptions(m[2], moment[1], moment[2], start)
  if (m[4] === 'finish') return { options: opts, dueAfter: before.dueAfter }
  // GB picker: "HH:MM", "(next day)" after a time earlier than the start, "(current)" after the current finish (22:45).
  const current = FIX.NORMAL.end_time.slice(0, 5)
  const lab = v => `${v}${mins(v) < mins(start) ? ' (next day)' : ''}${v === current ? ' (current)' : ''}`
  const oldLabels = (before.options || []).map(o => o.slice(o.indexOf('=') + 1)).join(' ')
  const at = before.text.indexOf(oldLabels)
  if (!oldLabels || at < 0) return before
  return { text: before.text.slice(0, at) + opts.map(lab).join(' ') + before.text.slice(at + oldLabels.length), options: opts.map(v => `${v}=${lab(v)}`) }
}

const _checks = checks
function checksWithFollowups(t, A, B) {
  _checks(t, A, B)
  for (const cc of ['GB', 'US']) {
    // Decision 2: on a NORMAL 18:00–23:30 event at 23:00 — same-day times first (as before), then the next day's, "(next day)".
    const f = A[`fu|${cc}|23:00|finish`] || {}
    t(`fu ${cc}: on a normal 18:00–23:30 event at 23:00 the finish times are 23:15, 23:30, 23:45, then 00:00 … 17:45 the next day (not 18:00)`,
      Array.isArray(f.options) && f.options.slice(0, 4).join() === '23:15,23:30,23:45,00:00' && f.options.includes('00:30') && f.options[f.options.length - 1] === '17:45' && !f.options.includes('18:00'), f.options && f.options.slice(0, 6))
    const pk = A[`fu|${cc}|23:00|modal-pick`] || {}, cf = A[`fu|${cc}|23:00|modal-confirm`] || {}, same = A[`fu|${cc}|23:00|modal-confirm-same`] || {}
    const z = cc === 'US' ? '12:30 AM (next day)' : '00:30 (next day)'
    // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-1-nbsp: the option LABELS carry U+00A0 before AM/PM (the confirm `text`
    // below is whitespace-collapsed and keeps reading `z`).
    const zOpt = z.replace(/ (AM|PM)\b/, '\u00A0$1')
    t(`fu ${cc}: the picker labels it "${z}"; the same-day times carry no label`, (pk.options || []).includes(`00:30=${zOpt}`) && (pk.options || []).includes(`23:15=${cc === 'US' ? '11:15\u00A0PM' : '23:15'}`), (pk.options || []).slice(0, 5))
    t(`fu ${cc}: choosing 00:30 — "This event will finish at ${z} instead of …"`, new RegExp(`finish at ${z.replace(/[()]/g, '\\$&')} instead of`).test(cf.text || ''), cf.text)
    t(`fu ${cc}: choosing a same-day time reads exactly as before (no "(next day)")`, !!same.text && !/next day/.test(same.text) && /finish at/.test(same.text), same.text)
    const act = A[`fu|${cc}|23:00|action-0030`] || {}
    t(`fu ${cc}: the update route saves 00:30 on the 18:00–23:30 event (it becomes overnight)`, act.status === 200 && JSON.stringify(act.wrote) === '["00:30"]', act)
    // …and the event it becomes (18:00–00:30): a 00:15 order is "in 25m" at 23:50.
    const card = (A[`extended|${cc}|23:50|card`] || []).find(c => c && c.slot === '00:15')
    t(`fu ${cc}: on the extended event a 00:15 order reads "in 25m" at 23:50 (not late)`, !!card && card.label === 'in 25m' && card.late === false, card)
  }
}

module.exports = { views, checks: checksWithFollowups, named }
