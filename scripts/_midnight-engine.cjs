// scripts/_midnight-engine.cjs — area "engine" of scripts/midnight-events.cjs: the slot / capacity engine and its routes on
// an event that runs past midnight (docs/midnight-and-format-fixes-report.md). A MODULE. Every view is the REAL module on
// fixtures (Pizza Kitchen, 'test-truck'; nothing live): app/api/slots/[truckId] (GET) and app/api/dashboard (GET) on the
// in-memory database (scripts/_fake-pg.cjs), lib/orders/place-in-slot placeOrderInSlotLocked on the same database,
// lib/slot-utils getAsapSlot, lib/capacity-breach detectCapacityBreaches, lib/slot-display buildSlotIndicators,
// lib/prep-utils resolveCollectionTime, lib/printing/printWatcher selectDueToPrint, lib/slots generateSlots and
// app/api/dashboard/action get_events. Runs on BOTH codes: BEFORE (692adb4, no lib/event-window.ts) ignores the extra
// arguments this tree takes (an `event`, a trailing event param).
const path = require('path')
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

const STUBS = {
  '@/lib/apns': 'export async function sendOrderPendingPush() {}\nexport function normaliseApnsKey(k) { return k }',
  '@/lib/fcm': 'export async function sendOrderPendingPush() {}',
  '@/lib/payments/authorize': `export async function authorizeDraft() { return { ok: true } }
export async function cancelAuthorization() { return { ok: true } }
export async function stripeAccountForTruck() { return null }`,
  '@/lib/payments/capture': 'export async function captureOnConfirmation() { return { ok: true, outcome: "nothing_to_capture" } }',
  '@capacitor/preferences': 'export const Preferences = { async get() { return { value: null } }, async set() {}, async remove() {} }',
  'next/headers': 'export async function cookies() { return { get() { return undefined }, getAll() { return [] }, set() {} } }\nexport async function headers() { return new Map() }',
  '@/lib/audit/actor': 'export async function resolveActor() { return { foreignOperator: false, currentUserName: null, userRole: null, actorKind: "token", actorId: null } }\nexport async function resolveActorSafe() { return { actorKind: "token", actorId: null, actorLabel: null } }\nexport function resolveActorSource() { return "web" }',
}

// The kitchen: one cooking category (10-minute prep, batch 4), an 8-item ceiling on 5-minute windows, 15-minute grids.
const CAT = { id: 'c1', truck_id: 'test-truck', name: 'Pizzas', prep_secs: 600, batch_size: 4, counts_toward_capacity: true, sort_order: 1, is_active: true }
const CAT_CONFIGS = { pizzas: { secs: 600, batch: 4, countsToCapacity: true } }
const ITEM_CAT = { Margherita: 'pizzas' }
const pizzas = n => [{ name: 'Margherita', quantity: n, price: 10 }]
// The probe slots per event: the after-midnight one (00:15) and an evening one (21:00); the normal event's analogue of 00:15 is 12:45.
const PROBE = { normal: { late: '12:45', early: '21:00', full: '22:00' }, midnight: { late: '00:15', early: '21:00', full: '23:30' } }

function tables(FIX, cc, ev, over = {}) {
  const C = FIX.COUNTRIES[cc]
  const settings = [snake(SEEDS.gbFromSeed()), snake({ ...SEEDS.usFromSeed(), enabled: true })]
  return {
    trucks: [{ id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', country: cc, timezone: C.tz, dashboard_token: 'tok-test', dashboard_pin: null, active: true,
      operator_id: 'op-test', collection_interval_mins: 15, slot_duration_mins: 15, plan: 'pro', feature_overrides: null, auto_accept: true, currency: C.currency }],
    country_settings: settings,
    truck_events: [FIX.eventRow('ev-1', ev, { van_id: 'v1', ...(over.event || {}) }), ...(over.moreEvents || [])],
    truck_vans: [{ id: 'v1', truck_id: 'test-truck', name: 'Van 1', active: true, kitchen_capacity: 8, capacity_window_mins: 5, collection_interval_mins: 15, operator_collection_interval_mins: 15 }],
    menu_categories: [CAT],
    menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 10, category_id: 'c1', available: true, is_active: true }],
    orders: (over.orders || []).map((o, i) => ({ id: i + 1, truck_id: 'test-truck', event_id: 'ev-1', event_date: FIX.EVENT_DATE, status: 'confirmed', created_at: `2026-09-30T10:0${i}:00Z`, deals: null, ...o })),
    collection_times: [], production_slot_usage: [], order_payments: [], truck_users: [], van_devices: [], booking_locks: [],
    modifier_groups: [], modifier_options: [], item_modifier_groups: [], bundles_db: [], discount_codes_db: [], order_drafts: [], event_option_stock: [],
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the plan catalogue (FIX.planTables — the seeded
    // plans / plan_prices / plan_features), which /api/dashboard (plan_blocks) and the order routes (truckCan) now reads; fixture input, never recorded.
    ...FIX.planTables(path.resolve(__dirname, '..')),
  }
}

async function views({ kit, REPO, FIX }) {
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const out = {}
  const safe = async (id, f) => { try { out[id] = await f() } catch (e) { out[id] = 'ERROR ' + String(e && e.message || e).slice(0, 200) } }
  let M = {}
  try {
    M = {
      lib: await kit.bundle('midnight-engine-lib', [
        "export { getAsapSlot } from '@/lib/slot-utils'",
        "export { generateCollectionTimes } from '@/lib/slot-generation'",
        "export { detectCapacityBreaches } from '@/lib/capacity-breach'",
        "export { buildSlotIndicators } from '@/lib/slot-display'",
        "export { resolveCollectionTime } from '@/lib/prep-utils'",
        "export { selectDueToPrint } from '@/lib/printing/printWatcher'",
        "export { generateSlots } from '@/lib/slots'",
        "export { placeOrderInSlotLocked } from '@/lib/orders/place-in-slot'",
        "export { getNowMinsInTz } from '@/lib/time-utils'",
      ].join('\n'), { stubs: STUBS }),
      // usePrinting's own "now" for the watcher (an unexported helper, reached through an append on both codes).
      printing: await kit.bundle('midnight-engine-printing', "export * from '@/lib/printing/usePrinting'", {
        stubs: { ...STUBS, '@capacitor/core': 'export const Capacitor = { isNativePlatform: () => false, getPlatform: () => "web" }\nexport function registerPlugin() { return new Proxy({}, { get: () => async () => ({}) }) }' },
        patches: [{ file: 'lib/printing/usePrinting.ts', append: 'export const __nowMinsLocal = nowMinsLocal' }],
      }),
      slots: await kit.bundle('midnight-engine-slots', "export { GET } from '@/app/api/slots/[truckId]/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS }),
      dash: await kit.bundle('midnight-engine-dash', "export { GET } from '@/app/api/dashboard/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS }),
      action: await kit.bundle('midnight-engine-action', "export { POST } from '@/app/api/dashboard/action/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: STUBS }),
    }
  } catch (e) { out['normal|GB|-|bundle'] = 'ERROR ' + String(e && e.message || e).slice(0, 300); return out }

  const withDb = async (tbl, fn) => {
    const db = makeFakePg(tbl, { keys: { orders: [['order_key']] } })
    globalThis.__harnessDb = { ...db, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
    for (const k of ['slots', 'dash', 'action']) M[k].clearCountrySettingsCache?.()
    try { return await kit.quietAsync(fn) } finally { delete globalThis.__harnessDb }
  }
  const get = url => new NextRequest(`http://127.0.0.1${url}`)
  const post = body => new NextRequest('http://127.0.0.1/api/dashboard/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-test', ...body }) })
  const compact = s => [s.collection_time, s.available, s.is_past, !!s.too_soon, s.is_grace, s.tone ?? null, s.current_orders, s.label ?? null]

  for (const [kind, ev, moments] of [['normal', FIX.NORMAL, FIX.NORMAL_MOMENTS], ['midnight', FIX.MIDNIGHT, FIX.MIDNIGHT_MOMENTS]]) {
    const P = PROBE[kind]
    const evTimes = { start_time: ev.start_time, end_time: ev.end_time }
    const startMins = Number(ev.start_time.slice(0, 2)) * 60 + Number(ev.start_time.slice(3, 5))
    // The existing board: 4 pizzas at the full slot (its batch is full), 2 at the evening one.
    const board = [{ order_key: 'ok-full', slot: P.full, items: pizzas(4) }, { order_key: 'ok-early', slot: P.early, items: pizzas(2) }]
    // An over-booked board for the breach detector: 6 pizzas at the late slot placed ANYWAY (batch reservations on, an
    // 'override' record with all 6 in the one window before it — on the event timeline, 00:05–00:15 the next day = 1445–1455).
    const overUnits = { [P.late]: { pizzas: 6 }, [P.early]: { pizzas: 2 } }
    const lateMins = kind === 'midnight' ? 1455 : 765
    const overRes = [{ orderKey: 'ok-over', slot: P.late, source: 'override', cats: { pizzas: { items: 6, batch: 4, prepMins: 10, windows: [{ startMins: lateMins - 10, endMins: lateMins, items: 6 }] } } }]
    const overOrders = [{ order_key: 'ok-over', id: 7, slot: P.late, status: 'confirmed' }, { order_key: 'ok-e', id: 8, slot: P.early, status: 'confirmed' }]
    for (const cc of ['GB', 'US']) {
      const tz = FIX.COUNTRIES[cc].tz
      kit.setDeviceTz(tz)
      const grid = M.lib.generateCollectionTimes(ev.start_time.slice(0, 5), ev.end_time.slice(0, 5), 15, 15, 30)
      await safe(`${kind}|${cc}|-|generateSlots`, () => M.lib.generateSlots(ev.start_time.slice(0, 5), ev.end_time.slice(0, 5), 15))
      // Time-independent engine reads (no "now" inside them).
      await safe(`${kind}|${cc}|-|indicators`, () => {
        const m = M.lib.buildSlotIndicators(grid, { [P.full]: { pizzas: 4 }, [P.early]: { pizzas: 2 } }, CAT_CONFIGS, 8, startMins, ['Pizzas'], 5, 15, [], false, evTimes)
        return [...m].filter(([, v]) => v.label).map(([k, v]) => [k, v.tone, v.label])
      })
      await safe(`${kind}|${cc}|-|breaches`, () => M.lib.detectCapacityBreaches({ times: grid, productionSlotUnits: overUnits, catConfigs: CAT_CONFIGS, kitchenCapacity: 8, eventStartMins: startMins, capacityWindowMins: 5, intervalMins: 15, orders: overOrders, reservations: overRes, batchReservations: true, event: evTimes })
        .map(b => ({ collection_time: b.collection_time, reason: b.reason, over_cats: b.over_cats, order_keys: b.order_keys, override_orders: b.override_orders })))
      for (const [label, ymd, hhmm] of moments) {
        kit.setNow(FIX.utcOf(cc, ymd, hhmm))
        const p = `${kind}|${cc}|${label}`
        const T = over => tables(FIX, cc, ev, over)
        // ── the customer slots API ──
        let slotRows = null
        await safe(`${p}|slots`, () => withDb(T({ orders: board }), async () => {
          const res = await M.slots.GET(get(`/api/slots/test-kitchen?date=${FIX.EVENT_DATE}&event_id=ev-1`), { params: Promise.resolve({ truckId: 'test-kitchen' }) })
          const j = await res.json()
          slotRows = j.slots || []
          const ci = j.capacityInputs || {}
          return { slots: slotRows.map(compact), eventEndMins: ci.eventEndMins ?? null, earliestCollectionMins: ci.earliestCollectionMins ?? null }
        }))
        await safe(`${p}|asap`, () => (slotRows ? (M.lib.getAsapSlot(slotRows, FIX.EVENT_DATE, tz, evTimes) || {}).collection_time || null : 'no slots'))
        // ── placement (pay-at-hatch and card share it) ──
        const place = (req, on) => withDb(T({ orders: board }), async () => {
          const r = await M.lib.placeOrderInSlotLocked('test-truck', FIX.EVENT_DATE, 'ev-1', req, pizzas(2), ITEM_CAT, CAT_CONFIGS, ev.start_time, ev.end_time, 15, 15, 8, 5, null, on, tz)
          return { finalSlot: r.finalSlot, booked: r.booked, reservationSlot: r.reservation ? r.reservation.slot : null, windows: r.reservation ? Object.values(r.reservation.cats || {}).flatMap(c => c.windows.map(w => [w.startMins, w.endMins, w.items])) : null }
        })
        await safe(`${p}|place-late`, () => place(P.late, false))
        await safe(`${p}|place-late-on`, () => place(P.late, true))
        await safe(`${p}|place-early`, () => place(P.early, false))
        await safe(`${p}|place-asap`, () => place(null, false))
        // ── the operator dashboard ──
        const dash = (q, over) => withDb(T({ orders: board, ...(over || {}) }), async () => {
          const j = await (await M.dash.GET(get(`/api/dashboard?token=tok-test${q}`))).json()
          return { todayEvent: j.todayEvent ? j.todayEvent.id : null, slots: (j.slots || []).map(compact), breaches: (j.capacityBreaches || []).map(b => b.collection_time) }
        })
        await safe(`${p}|dashboard`, () => dash(`&date=${FIX.EVENT_DATE}&event_id=ev-1`))
        // No date: the board's own "today" (the KDS's first load). The next day also has a lunchtime event.
        const nextEv = FIX.eventRow('ev-next', { start_time: '12:00:00', end_time: '15:00:00' }, { event_date: FIX.NEXT_DATE })
        await safe(`${p}|dashboard-nodate`, async () => (await dash('', { moreEvents: [nextEv] })).todayEvent)
        await safe(`${p}|get_events`, () => withDb(T({ moreEvents: [nextEv] }), async () => {
          const j = await (await M.action.POST(post({ action: 'get_events' }))).json()
          return (j.events || []).map(e => e.id)
        }))
        // ── the collection instant, and the print watcher's lead-time decision (15 minutes) ──
        await safe(`${p}|resolve`, () => { const d = M.lib.resolveCollectionTime({ slot: P.late, event_date: FIX.EVENT_DATE }, { event_date: FIX.EVENT_DATE, ...evTimes }, tz); return d && d.toISOString() })
        await safe(`${p}|print`, () => {
          const truck = { time: FIX.time(cc) }, event = { event_date: FIX.EVENT_DATE, ...evTimes }
          const nowMins = M.printing.__nowMinsLocal(truck, event)
          const orders = [P.late, P.early].map(s => ({ order_key: `o-${s}`, slot: s, status: 'confirmed' }))
          return M.lib.selectDueToPrint(orders, { mode: 'lead_time', nowMins, leadMins: 15, printed: new Set(), event }).map(o => o.slot)
        })
      }
    }
  }
  return out
}

function checks(t, A) {
  const ct = v => (v && Array.isArray(v.slots) ? v.slots.map(r => r[0]) : [])
  const row = (v, s) => (v && Array.isArray(v.slots) ? v.slots.find(r => r[0] === s) : null)
  for (const cc of ['GB', 'US']) {
    const m = (mo, w) => A[`midnight|${cc}|${mo}|${w}`]
    // Slots, in order, canonical.
    const s1900 = ct(m('19:00', 'slots'))
    const want = ['20:00', '20:15', '23:45', '00:00', '00:15', '00:30', '00:45', '01:00']
    t(`engine ${cc}: the slots API lists 20:00 … 23:45, 00:00 … 00:30 (+ 30-min grace), canonical and in order`,
      s1900[0] === '20:00' && want.every((x, i) => i === 0 || s1900.indexOf(x) > s1900.indexOf(want[i - 1])) && s1900.every(x => /^\d{2}:\d{2}$/.test(x) && x < '24'), s1900.join(' '))
    t(`engine ${cc}: 00:45 and 01:00 are the grace slots, 00:30 is not`, row(m('19:00', 'slots'), '00:30')?.[4] === false && row(m('19:00', 'slots'), '00:45')?.[4] === true, [row(m('19:00', 'slots'), '00:30'), row(m('19:00', 'slots'), '00:45')])
    t(`engine ${cc}: the event's end is 24:30 on the engine timeline (capacityInputs.eventEndMins = 1470)`, m('19:00', 'slots')?.eventEndMins === 1470, m('19:00', 'slots')?.eventEndMins)
    t(`engine ${cc}: at 19:00 nothing is past and 20:00 is offered`, (m('19:00', 'slots')?.slots || []).every(r => r[2] === false) && row(m('19:00', 'slots'), '20:00')?.[1] === true)
    t(`engine ${cc}: at 23:50 00:15 is NOT past and is offered; 23:45 is past`, row(m('23:50', 'slots'), '00:15')?.[2] === false && row(m('23:50', 'slots'), '00:15')?.[1] === true && row(m('23:50', 'slots'), '23:45')?.[2] === true, [row(m('23:50', 'slots'), '00:15'), row(m('23:50', 'slots'), '23:45')])
    t(`engine ${cc}: at 23:50 the earliest collection is now + one 10-min cook = 24:00 (1440) on the timeline`, m('23:50', 'slots')?.earliestCollectionMins === 1440, m('23:50', 'slots')?.earliestCollectionMins)
    t(`engine ${cc}: ASAP at 23:50 is 00:00 — the first slot ≥ now + prep`, m('23:50', 'asap') === '00:00', m('23:50', 'asap'))
    t(`engine ${cc}: at 00:15 (next day) 00:00 is past, 00:30 is not; ASAP is 00:30 (00:15 + 10-min cook)`, row(m('00:15', 'slots'), '00:00')?.[2] === true && row(m('00:15', 'slots'), '00:30')?.[2] === false && m('00:15', 'asap') === '00:30', [row(m('00:15', 'slots'), '00:00'), row(m('00:15', 'slots'), '00:30'), m('00:15', 'asap')])
    t(`engine ${cc}: at 00:31 00:15 is past and nothing before the grace is offered`, row(m('00:31', 'slots'), '00:15')?.[2] === true && (m('00:31', 'slots')?.slots || []).filter(r => !r[4]).every(r => r[1] === false))
    t(`engine ${cc}: the next afternoon every slot is past`, (m('next-afternoon', 'slots')?.slots || []).filter(r => !r[4]).every(r => r[2] === true))
    // Placement.
    for (const mo of ['19:00', '23:50']) {
      const pl = m(mo, 'place-late')
      t(`engine ${cc} ${mo}: placing at 00:15 books 00:15 (not pending, not full), stored canonical "00:15"`, pl && pl.booked === true && pl.finalSlot === '00:15', pl)
      const on = m(mo, 'place-late-on')
      t(`engine ${cc} ${mo}: with batch reservations on, the 00:15 record is stored as "00:15" and its cooking window is 00:05–00:15 the next day (1445–1455)`,
        on && on.finalSlot === '00:15' && on.reservationSlot === '00:15' && JSON.stringify(on.windows) === JSON.stringify([[1445, 1455, 2]]), on)
    }
    t(`engine ${cc} 19:00: placing at 21:00 books 21:00`, m('19:00', 'place-early')?.booked === true && m('19:00', 'place-early')?.finalSlot === '21:00', m('19:00', 'place-early'))
    t(`engine ${cc} 23:50: placing at 21:00 (past) moves FORWARD to the first slot it can still cook for: 00:00`, m('23:50', 'place-early')?.finalSlot === '00:00', m('23:50', 'place-early'))
    t(`engine ${cc} 23:50: ASAP placement books 00:00`, m('23:50', 'place-asap')?.booked === true && m('23:50', 'place-asap')?.finalSlot === '00:00', m('23:50', 'place-asap'))
    t(`engine ${cc} 00:15: placing at 00:15 books 00:30 (00:15 cannot be cooked in time any more), not pending`, m('00:15', 'place-late')?.booked === true && m('00:15', 'place-late')?.finalSlot === '00:30', m('00:15', 'place-late'))
    t(`engine ${cc} 00:31: after the end an order goes pending (never placed past the end)`, m('00:31', 'place-late')?.booked === false && m('00:31', 'place-late')?.finalSlot === null, m('00:31', 'place-late'))
    // Capacity.
    const br = A[`midnight|${cc}|-|breaches`]
    t(`engine ${cc}: 6 pizzas placed anyway at 00:15 (batch 4) breach the 00:15 window — named "00:15", with that order — not minute 15`,
      Array.isArray(br) && br.length === 1 && br[0].collection_time === '00:15' && br[0].order_keys.includes('ok-over') && (br[0].override_orders || []).some(o => o.slot === '00:15'), br)
    const ind = A[`midnight|${cc}|-|indicators`]
    t(`engine ${cc}: the day-load dots show the 4 pizzas at 23:30 on 23:30 (keyed canonical) and nothing at 00:15`,
      Array.isArray(ind) && ind.some(([k, , l]) => k === '23:30' && /4/.test(l)) && !ind.some(([k]) => k === '00:15'), ind)
    t(`engine ${cc}: the dashboard's slots are canonical and in order, 00:15 at 23:50 not past`,
      ct(m('23:50', 'dashboard')).indexOf('00:15') > ct(m('23:50', 'dashboard')).indexOf('23:45') && row(m('23:50', 'dashboard'), '00:15')?.[2] === false, ct(m('23:50', 'dashboard')).join(' '))
    t(`engine ${cc}: the dashboard's 00:15 slot is past at 00:31`, row(m('00:31', 'dashboard'), '00:15')?.[2] === true)
    t(`engine ${cc}: the dashboard with no date shows the overnight event while it runs (00:15) and the next day's after (00:31)`,
      m('23:50', 'dashboard-nodate') === 'ev-1' && m('00:15', 'dashboard-nodate') === 'ev-1' && m('00:31', 'dashboard-nodate') === 'ev-next', ['23:50', '00:15', '00:31'].map(x => m(x, 'dashboard-nodate')))
    t(`engine ${cc}: get_events keeps the overnight event until it ends (00:15 yes, 00:31 no)`,
      (m('00:15', 'get_events') || []).includes('ev-1') && !(m('00:31', 'get_events') || []).includes('ev-1'), ['00:15', '00:31'].map(x => m(x, 'get_events')))
    // The collection instant and the printer.
    const want0015 = require('./_midnight-fixtures.cjs').utcOf(cc, '2026-10-01', '00:15').replace(/\.\d{3}Z$/, '.000Z')
    t(`engine ${cc}: resolveCollectionTime(00:15) is 00:15 on the NEXT day in the truck's zone`, m('23:50', 'resolve') === want0015, [m('23:50', 'resolve'), want0015])
    t(`engine ${cc}: the 00:15 ticket (15-min lead) is NOT due at 19:00 or 23:50, due at 00:15; 21:00 due from 23:50`,
      JSON.stringify(m('19:00', 'print')) === '[]' && JSON.stringify(m('23:50', 'print')) === '["21:00"]' && (m('00:15', 'print') || []).includes('00:15'), ['19:00', '23:50', '00:15'].map(x => m(x, 'print')))
    t(`engine ${cc}: generateSlots (the slot_capacity grid) walks past midnight, canonical`, JSON.stringify((A[`midnight|${cc}|-|generateSlots`] || []).slice(-4)) === '["23:45","00:00","00:15","00:30"]', A[`midnight|${cc}|-|generateSlots`])
  }
}

module.exports = { views, checks }
