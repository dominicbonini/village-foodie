#!/usr/bin/env node
// scripts/time-dates-parity.cjs — every time, date, "now" and "today" a UK truck, operator, customer, kitchen
// or scheduler sees or decides, before and after Phase 2B (docs/time-and-dates-report.md).
//
//   node scripts/time-dates-parity.cjs                    check against the committed BEFORE snapshot (GB)
//   node scripts/time-dates-parity.cjs --capture <file>   write a snapshot of the current code
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// The BEFORE snapshot was taken on the unchanged code, before the first edit of this phase, at FOUR frozen
// instants — a BST afternoon, a GMT afternoon, 23:30 London and 00:30 London (BST, when the UTC date is
// still the day before). Each surface is rendered where it really runs: a browser on a UK device
// (TZ=Europe/London) or a Vercel function (TZ=UTC). Nothing reaches a database or the network: the
// database is an in-memory table set (scripts/_render-kit.cjs fakeDb) that honours the filters a query
// states and records every write, so the scheduler's open/close/pause decisions are its WRITES.
//
// ── WHAT IS SNAPSHOTTED, PER INSTANT ─────────────────────────────────────────────────────────────────────
//   helpers   eventDateLabel, formatFriendlyDate, pickDefaultEventByTime, ASAP / past slots, calcReadyTime,
//             localTodayIso, the weekly post's week (today, default, this / next), its caption dates,
//             the WhatsApp usage month, the demo event window — on a UK device AND on a UTC server
//   slots     the real GET /api/slots/[truckId] for yesterday's, today's and tomorrow's event and with
//             no date; buildSlotAvailability direct
//   orders    decideAutoAccept with pre-order deadlines; placeOrderInSlotLocked for today and tomorrow
//   edge      auto-event-scheduler and heartbeat-monitor, run against fixture rows — their writes
//   events    the real GET /api/events (date labels the order page shows)
//   prompts   the WhatsApp classifier's SPECIFIC_QUERY prompt (its date reference) and the schedule-import
//             prompt (its 14-day table)
//   emails    the event-cancellation email's date, the confirmation's collection line

const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'time-dates' })
const { REPO, h } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/time-dates-before.json'

// ── THE FOUR INSTANTS ─────────────────────────────────────────────────────────────────────────────────────
const MOMENTS = {
  bstAfternoon: '2026-10-09T14:20:00.000Z',   // Fri 9 Oct 15:20 BST
  gmtAfternoon: '2026-11-13T15:20:00.000Z',   // Fri 13 Nov 15:20 GMT
  late2330:     '2026-10-09T22:30:00.000Z',   // Fri 9 Oct 23:30 BST — UTC is still 9 Oct
  after0030:    '2026-10-09T23:30:00.000Z',   // Sat 10 Oct 00:30 BST — UTC is STILL 9 Oct
}
const LONDON = 'Europe/London'
const DEVICE_UK = 'Europe/London', SERVER = 'UTC'

// The London calendar around an instant — the fixtures' events sit on these days.
function londonDays(iso) {
  const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const t = new Date(iso).getTime()
  const today = ymd(new Date(t))
  const shift = (n) => { const [y, m, d] = today.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
  return { today, yesterday: shift(-1), tomorrow: shift(1), plus5: shift(5), minus8: shift(-8) }
}
const dmy = ymd => { const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}` }

const GB_TRUCK = {
  id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', dashboard_token: 'harness', country: 'GB', currency: 'GBP', timezone: null,
  plan: 'max', feature_overrides: {}, trial_expires_at: null, preorders_enabled: true, auto_accept: true,
  collection_interval_mins: 10, slot_duration_mins: 10, mode: 'village', venue_name: null, logo: null,
}
// The settings rows, as the database holds them (snake_case), from the seed migrations — the loader maps
// every column, so a partial row would fail the way a real missing column would.
const SEEDS = require('./_country-settings-gb.cjs')
const snakeRow = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const GB_SETTINGS_ROW = snakeRow(SEEDS.gbFromSeed())
const US_SETTINGS_ROW = snakeRow(SEEDS.usFromSeed())
// A truck's TimeSettings as lib/truck-time.ts builds them — from the seed row, never typed in here.
const tsOf = (row, zone) => ({ timeZone: zone ?? row.default_timezone, locale: row.locale, timeFormat: row.time_format, dateOrder: row.date_order, weekStart: row.week_start })
const GB_TS = tsOf(GB_SETTINGS_ROW)
const GB_WEEK = { timeZone: GB_TS.timeZone, weekStart: GB_TS.weekStart }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · HELPERS — on a UK device and on a UTC server
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
let helpersMod
async function helpersView(M, D) {
  helpersMod ??= await kit.bundle('helpers', [
    `export * as T from '@/lib/time-utils'`, `export * as SU from '@/lib/slot-utils'`, `export * as P from '@/lib/prep-utils'`,
    `export * as ED from '@/lib/event-display'`, `export * as U from '@/lib/utils'`, `export * as W from '@/lib/weekly-post/week'`,
    `export * as CT from '@/lib/weekly-post/caption-template'`, `export * as WU from '@/lib/whatsapp/usage'`,
    `export * as DE from '@/lib/provision-demo-event'`, `export * as PL from '@/lib/schedule-graphics/places'`,
    `export * as TT from '@/lib/truck-time'`,
  ].join('\n'))
  const m = helpersMod
  const out = {}
  for (const [dev, tz] of [['ukDevice', DEVICE_UK], ['utcServer', SERVER]]) {
    kit.setDeviceTz(tz)
    const r = {}
    // \`localTodayIso()\` is gone: it answered London's date whatever the truck. Its successor for a GB truck
    // is the truck's zone, which for every GB truck is London — the same value, by the one rule.
    r.localTodayIso = m.T.getLocalDateInTz(GB_TS.timeZone)
    r.nowMinsLondon = m.T.getNowMinsInTz(LONDON)
    r.todayLondon = m.T.getLocalDateInTz(LONDON)
    r.eventDateLabel = Object.fromEntries(['yesterday', 'today', 'tomorrow', 'plus5'].flatMap(k => [[`${k}|long`, m.ED.eventDateLabel(D[k], GB_TS)], [`${k}|compact`, m.ED.eventDateLabel(D[k], GB_TS, 'compact')]]))
    r.formatFriendlyDate = Object.fromEntries(['yesterday', 'today', 'tomorrow', 'plus5'].map(k => [k, m.U.formatFriendlyDate(dmy(D[k]))]))
    const evs = [
      { id: 'y', event_date: D.yesterday, start_time: '17:00', end_time: '21:00' },
      { id: 't', event_date: D.today, start_time: '17:00', end_time: '21:00' },
      { id: 'tl', event_date: D.today, start_time: '22:00', end_time: '23:59' },
      { id: 'm', event_date: D.tomorrow, start_time: '11:30', end_time: '14:00' },
    ]
    r.pickDefault = m.T.pickDefaultEventByTime(evs, GB_TS.timeZone)?.id ?? null
    const slots = ['14:30', '15:20', '15:30', '17:00', '18:30', '21:00', '23:40'].map(t => ({ collection_time: t, available: true }))
    for (const day of ['yesterday', 'today', 'tomorrow']) {
      r[`asap|${day}`] = m.SU.getAsapSlot(slots, D[day], LONDON)?.collection_time ?? null
      r[`past|${day}`] = slots.map(s => m.SU.isSlotPast(s, LONDON, D[day]))
    }
    r.calcReadyTime = m.P.calcReadyTime([{ name: 'Margherita', quantity: 2 }], 300, [{ name: 'Margherita', category: 'Pizzas' }], { pizzas: { secs: 300, batch: 4 } }, GB_TS.timeZone)
    const now = new Date()
    r.week = { today: m.W.todayInWeekTz(now, GB_WEEK), default: m.W.defaultWeekChoice(now, GB_WEEK), this: m.W.weekRange('this', now, GB_WEEK), next: m.W.weekRange('next', now, GB_WEEK), options: m.W.weekOptions(now, GB_WEEK).map(w => `${w.start}..${w.end}`) }
    r.eventCaption = ['yesterday', 'today', 'tomorrow', 'plus5'].map(k => m.CT.eventCaptionValues({ placeName: 'The Green', town: 'Harnessville', date: D[k], startTime: '17:00', endTime: '21:00', orderUrl: 'https://x', timeStyle: '24h', now, timeZone: GB_TS.timeZone })['day-date'])
    // \`truckTimezone(null)\` (London for every truck) is gone; the one rule answers for the GB truck.
    globalThis.__harnessDb = kit.fakeDb({ country_settings: [GB_SETTINGS_ROW] })
    let gbZone
    try { gbZone = await m.TT.truckTimeZone(GB_TRUCK) } finally { delete globalThis.__harnessDb }
    r.usage = { monthStart: m.WU.monthStartIso(gbZone), reset: m.WU.monthResetLocalDate(gbZone), tz: gbZone }
    r.demoWindow = m.DE.demoEventWindow(now, gbZone)
    r.seedWindowStart = m.PL.seedWindowStart(new Date())
    out[dev] = r
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · SLOTS — the real route, on a UTC server
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
function slotTables(D, truck = GB_TRUCK) {
  return {
    trucks: [truck],
    truck_events: [
      { id: 'ev-y', truck_id: truck.id, event_date: D.yesterday, start_time: '17:00:00', end_time: '21:00:00', status: 'closed', van_id: null, extra_wait_mins: 0, extra_wait_started_at: null },
      { id: 'ev-t', truck_id: truck.id, event_date: D.today, start_time: '12:00:00', end_time: '23:59:00', status: 'open', van_id: null, extra_wait_mins: 0, extra_wait_started_at: null },
      { id: 'ev-m', truck_id: truck.id, event_date: D.tomorrow, start_time: '11:30:00', end_time: '14:00:00', status: 'confirmed', van_id: null, extra_wait_mins: 0, extra_wait_started_at: null },
    ],
    orders: [], collection_times: [],
    menu_categories: [{ id: 'c1', truck_id: truck.id, name: 'Pizzas', prep_secs: 300, batch_size: 4, counts_toward_capacity: true }],
    menu_items_db: [{ name: 'Margherita', category_id: 'c1', truck_id: truck.id }],
    truck_vans: [], production_slot_usage: [], country_settings: [GB_SETTINGS_ROW],
  }
}
let slotsMod
async function slotsView(M, D) {
  slotsMod ??= await kit.bundle('slots', `export { GET } from '@/app/api/slots/[truckId]/route'\nexport { buildSlotAvailability } from '@/lib/slot-availability'\nexport { getNowMinsInTz } from '@/lib/time-utils'`)
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  kit.setDeviceTz(SERVER)
  globalThis.__harnessDb = kit.fakeDb(slotTables(D))
  const out = {}
  try {
    for (const [k, q] of [['yesterday', `date=${D.yesterday}`], ['today', `date=${D.today}`], ['tomorrow', `date=${D.tomorrow}`], ['noDate', ''], ['todayById', `event_id=ev-t`]]) {
      const res = await kit.quietAsync(() => slotsMod.GET(new NextRequest(`http://localhost/api/slots/test-truck?${q}`), { params: Promise.resolve({ truckId: 'test-truck' }) }))
      const body = await res.json()
      out[k] = (body.slots || []).map(s => `${s.collection_time}${s.is_past ? ' past' : ''}${s.too_soon ? ' soon' : ''}${s.is_grace ? ' grace' : ''}${s.available ? '' : ' full'}`).join(', ')
    }
    // The engine direct, for one representative event: what it seats and what it refuses.
    const times = ['17:00', '17:10', '17:20', '17:30', '17:40'].map(t => ({ collection_time: t, production_slot: t }))
    for (const day of ['today', 'tomorrow']) {
      const rows = slotsMod.buildSlotAvailability({ times, productionSlotUnits: { '17:10': { pizzas: 4 } }, catConfigs: { pizzas: { secs: 300, batch: 4, countsToCapacity: true } }, kitchenCapacity: 8, capacityWindowMins: 5, date: D[day], nowMins: slotsMod.getNowMinsInTz(LONDON), earliestCollectionMins: 17 * 60, eventStartMins: 17 * 60, eventEndMins: 18 * 60, basketByCat: { pizzas: 6 }, tz: LONDON, displayIntervalMins: 10 })
      out[`engine|${day}`] = rows.map(s => `${s.collection_time}:${s.available ? 'ok' : 'no'}${s.is_past ? ':past' : ''}`).join(' ')
    }
  } finally { delete globalThis.__harnessDb }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · ORDERS — auto-accept with pre-order deadlines, and place-in-slot (UTC server)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
let ordersMod
async function ordersView(M, D) {
  ordersMod ??= await kit.bundle('orders', `export { decideAutoAccept } from '@/lib/orders/auto-accept'\nexport { placeOrderInSlotLocked } from '@/lib/orders/place-in-slot'`)
  kit.setDeviceTz(SERVER)
  const out = {}
  const cfgs = {
    hours2: { enabled: true, deadlineType: 'hours_before', deadlineValue: 2, pastAction: 'force_pending' },
    cutoff16: { enabled: true, deadlineType: 'daily_cutoff', deadlineValue: 16 * 60, pastAction: 'force_pending' },
    cutoff2330: { enabled: true, deadlineType: 'daily_cutoff', deadlineValue: 23 * 60 + 30, pastAction: 'force_pending' },
  }
  for (const day of ['yesterday', 'today', 'tomorrow']) {
    for (const [ck, cfg] of Object.entries(cfgs)) {
      for (const start of [17 * 60, 23 * 60 + 45]) {
        out[`auto|${day}|${ck}|${start}`] = ordersMod.decideAutoAccept({
          truck: GB_TRUCK, orderLines: [{ name: 'Margherita' }], autoAcceptByName: { Margherita: true }, preorderByName: { Margherita: cfg },
          eventDate: D[day], eventStartMins: start, offlineNoAutoAcceptUntil: null, notes: null, items: [], deals: [],
          timeZone: LONDON,
        })
      }
    }
  }
  const tables = {
    collection_times: [], orders: [], production_slot_usage: [], cooking_reservations: [],
  }
  globalThis.__harnessDb = kit.fakeDb(tables)
  try {
    for (const day of ['today', 'tomorrow']) {
      for (const req of [null, '17:00', '21:30']) {
        const r = await kit.quietAsync(() => ordersMod.placeOrderInSlotLocked('test-truck', D[day], 'ev-t', req, [{ name: 'Margherita', quantity: 6 }], { Margherita: 'pizzas' }, { pizzas: { secs: 300, batch: 4, countsToCapacity: true } }, '12:00:00', '23:59:00', 10, 10, 8, 5, null, false, LONDON))
        out[`place|${day}|${req ?? 'asap'}`] = `${r.finalSlot}|${r.booked}`
      }
    }
  } finally { delete globalThis.__harnessDb }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · THE TWO EDGE FUNCTIONS — their writes against fixture rows
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
async function edgeView(M, D) {
  kit.setDeviceTz(SERVER)
  const out = {}
  globalThis.Deno = { env: { get: () => 'http://127.0.0.1:9' }, serve: hnd => { globalThis.__denoHandler = hnd } }
  const trucks = [GB_TRUCK, { ...GB_TRUCK, id: 'gb-2', timezone: null }]
  const ev = (id, date, start, end, status, extra = {}) => ({ id, truck_id: 'test-truck', van_id: 'van-1', event_date: date, start_time: start, end_time: end, status, auto_open: true, auto_close: true, online_paused_until: null, offline_no_autoaccept_until: null, offline_protection_override: null, offline_protection_mode_override: null, event_types: null, ...extra })
  const events = [
    ev('open-y', D.yesterday, '17:00:00', '21:00:00', 'open'),
    ev('conf-t-early', D.today, '12:00:00', '15:00:00', 'confirmed'),
    ev('conf-t-1500', D.today, '15:00:00', '18:00:00', 'confirmed'),
    ev('conf-t-1530', D.today, '15:30:00', '18:00:00', 'confirmed'),
    ev('conf-t-2300', D.today, '23:00:00', '23:59:00', 'confirmed'),
    ev('open-t-ended', D.today, '12:00:00', '15:00:00', 'open'),
    ev('open-t-2320', D.today, '20:00:00', '23:20:00', 'open'),
    ev('open-t-manual', D.today, '12:00:00', '15:00:00', 'open', { auto_close: false }),
    ev('conf-m-0015', D.tomorrow, '00:15:00', '02:00:00', 'confirmed'),
    ev('open-m', D.tomorrow, '11:00:00', '14:00:00', 'open'),
  ]
  for (const fn of ['auto-event-scheduler', 'heartbeat-monitor']) {
    const writes = []
    globalThis.__harnessDb = kit.fakeDb({
      truck_events: events.map(e => ({ ...e })), trucks, country_settings: [GB_SETTINGS_ROW],
      truck_vans: [{ id: 'van-1', truck_id: 'test-truck', name: 'Van', active: true, auto_pause_on_offline: true, offline_protection_mode: 'pause', last_heartbeat_at: null }],
    }, writes)
    try {
      const m = await kit.bundle(`edge-${fn}`, `import '@/supabase/functions/${fn}/index.ts'`)
      void m
      const res = await kit.quietAsync(() => globalThis.__denoHandler(new Request('http://localhost/')))
      const body = await res.json()
      for (const k of ['checkedAt']) delete body[k]
      out[fn] = { body, writes: writes.map(w => `${w.table}:${w.op}:${Object.keys(w.patch || {}).sort().join('+')}:${w.ids.slice().sort().join(',')}`) }
    } finally { delete globalThis.__harnessDb; delete globalThis.__denoHandler }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · /api/events — the date labels the order page shows (UTC server)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
let eventsMod
async function eventsView(M, D) {
  eventsMod ??= await kit.bundle('events', `export { GET } from '@/app/api/events/route'`)
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  kit.setDeviceTz(SERVER)
  const mk = (id, date, start, end, status = 'confirmed') => ({ id, truck_id: 'test-truck', event_date: date, start_time: start, end_time: end, venue_name: 'The Green', town: 'Harnessville', postcode: null, notes: null, status, is_private: false, van_id: null, event_type_id: null, opened_at: null, collection_interval_mins: null })
  globalThis.__harnessDb = kit.fakeDb({
    trucks: [GB_TRUCK], country_settings: [GB_SETTINGS_ROW],
    truck_events: [mk('y', D.yesterday, '17:00:00', '21:00:00', 'closed'), mk('t', D.today, '17:00:00', '21:00:00', 'open'), mk('m', D.tomorrow, '11:30:00', '14:00:00'), mk('p', D.plus5, '17:00:00', '20:00:00')],
    truck_vans: [], private_event_links: [],
  })
  try {
    const res = await kit.quietAsync(() => eventsMod.GET(new NextRequest('http://localhost/api/events?truck=test-kitchen')))
    const body = await res.json()
    const list = Array.isArray(body) ? body : (body.events || [])
    return list.map(e => `${e.date_iso ?? e.event_date}|${e.date ?? ''}|${e.date_friendly ?? ''}|${e.start_time}-${e.end_time}`)
  } finally { delete globalThis.__harnessDb }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · PROMPTS — the WhatsApp date reference and the schedule-import table (UTC server)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
let promptsMod
async function promptsView(M, D) {
  promptsMod ??= await kit.bundle('prompts', `export * as W from '@/lib/whatsapp-classifier'\nexport * as S from '@/lib/schedule-extract'`)
  kit.setDeviceTz(SERVER)
  const prompts = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (_u, init) => {
    const text = JSON.parse(init.body).contents[0].parts[0].text
    prompts.push(text)
    const answer = text.startsWith('Classify') ? 'SPECIFIC_QUERY' : 'Hey there 👋 See you soon — Pizza Kitchen 🍕'
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: answer }] } }] }), text: async () => answer }
  }
  const out = {}
  try {
    const events = [
      { event_date: D.today, start_time: '17:00:00', end_time: '21:00:00', venue_name: 'The Green', town: 'Harnessville', postcode: null, status: 'confirmed' },
      { event_date: D.tomorrow, start_time: '11:30:00', end_time: '14:00:00', venue_name: 'The Square', town: 'Harnessville', postcode: null, status: 'confirmed' },
      { event_date: D.plus5, start_time: '17:00:00', end_time: '20:00:00', venue_name: 'Mill Lane', town: 'Harnessville', postcode: null, status: 'confirmed' },
    ]
    const r = await kit.quietAsync(() => promptsMod.W.generateWhatsAppReply({ customerMessage: 'where are you this weekend', truckName: 'Pizza Kitchen', truckEmoji: '🍕', truckId: 'test-truck', orderUrl: 'https://x', scheduleUrl: 'https://x', events, money: { currency: 'GBP', locale: 'en-GB' }, time: GB_TS }))
    out.reply = r.reply
    out.whatsappPrompt = prompts.find(p => p.includes('DATE REFERENCE')) ?? null
    out.schedulePrompt = promptsMod.S.buildScheduleExtractionPrompt('Fri: The Green 5-9pm', GB_TS).split('\n').slice(0, 24).join('\n')
  } finally { globalThis.fetch = realFetch }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 7 · EMAILS — the event-cancellation date and the confirmation's collection line (UTC server)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
let emailMod
async function emailsView(M, D) {
  emailMod ??= await kit.bundle('email', `export * as E from '@/lib/email'`)
  kit.setDeviceTz(SERVER)
  const sent = []
  const realFetch = globalThis.fetch
  const realKey = process.env.BREVO_API_KEY
  process.env.BREVO_API_KEY = 'harness-not-a-key'
  globalThis.fetch = async (_u, init) => { sent.push(JSON.parse(init.body)); return { ok: true, text: async () => '' } }
  try {
    for (const day of ['today', 'tomorrow', 'plus5']) {
      await kit.quietAsync(() => emailMod.E.sendEventCancellationEmail({ to: 'sam@example.test', customerName: 'Sam', truckName: 'Pizza Kitchen', venueName: 'The Green', village: 'Harnessville', eventDate: D[day], note: 'Weather', paymentStatus: 'unpaid', orderId: '41', time: GB_TS }))
    }
  } finally { globalThis.fetch = realFetch; if (realKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = realKey }
  const items = [{ name: 'Margherita', quantity: 2, unit_price: 9.5, modifiers: [] }]
  const conf = (variant, extra = {}) => emailMod.E.formatConfirmationEmail({ orderId: '40', orderKey: 'k', truckName: 'Pizza Kitchen', customerName: 'Sam', slot: '18:30', items, deals: [], discountAmt: 0, total: 19, notes: null, venueName: 'The Green', venueTown: 'Harnessville', allowCancellation: true, cancellationCutoffMins: 30, baseUrl: 'https://www.hatchgrab.com', truckSlug: 'test-kitchen', variant, money: { currency: 'GBP', locale: 'en-GB' }, time: GB_TS, ...extra }).text
  return {
    cancellations: sent.map(b => ({ subject: b.subject, text: b.textContent })),
    confirmation: conf('confirmation', { autoAccepted: true }),
    adjusted: conf('confirmation', { autoAccepted: true, slotAdjustedFrom: '18:00' }),
    ready: conf('ready'),
    newOrder: emailMod.E.formatNewOrderEmail({ orderId: '40', customerName: 'Sam', slot: '18:30', items, deals: [], total: 19, notes: null, venueName: 'The Green', venueTown: 'Harnessville', money: { currency: 'GBP', locale: 'en-GB' }, time: GB_TS }).text,
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 8 · THE SCREENS — rendered as a UK browser (TZ=Europe/London) at each instant
// Fixtures are the money harness's, with every date relative to the instant: orders on today's event,
// placed 50 minutes ago, collecting at 18:30.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const FMT = { currency: 'GBP', locale: 'en-GB' }
const ITEMS = [
  { name: 'Margherita', quantity: 2, unit_price: 10.75, base_price: 9.5, modifiers: [{ name: 'Extra cheese', price: 1.25 }] },
  { name: 'Coke', quantity: 3, unit_price: 1.8, modifiers: [], specialInstructions: 'No ice' },
]
const ch = (minor, channel = 'online', kind = 'charge', method = 'card') => ({ kind, channel, amount_minor: minor, state: 'succeeded', method, external_ref: kind === 'charge' && channel === 'online' ? 'pi_harness' : null, livemode: true })
const CASES = {
  paid:     { total: 26.9, ledger: [ch(2690)], state: 'captured', status: 'confirmed', slot: '18:30' },
  hatch:    { total: 26.9, ledger: [], state: 'hatch', status: 'confirmed', slot: '15:40' },
  pending:  { total: 26.9, ledger: [], state: 'hatch', status: 'pending', slot: null },
  ready:    { total: 26.9, ledger: [ch(1000, 'in_person_other', 'charge', 'cash')], state: 'part_paid', status: 'ready', slot: '23:40' },
  done:     { total: 26.9, ledger: [ch(2690)], state: 'captured', status: 'collected', slot: '14:00' },
}
function ordersFor(D) {
  const placed = new Date(Date.now() - 50 * 60000).toISOString()
  return Object.fromEntries(Object.entries(CASES).map(([k, c], i) => [k, {
    id: String(40 + i), order_key: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
    customer_name: 'Sam Harness', customer_phone: '07700 900123', customer_email: 'sam@example.test',
    slot: c.slot, requested_slot: null, asap_estimate: c.slot ? null : '16:05', event_date: D.today, event_id: 'ev-1', van_id: null, status: c.status,
    items: ITEMS.map(x => ({ ...x })), deals: [], total: c.total, total_minor: Math.round(c.total * 100),
    notes: null, paid_at: null, collected_at: c.status === 'collected' ? placed : null, created_at: placed, updated_at: placed, placed_at: placed,
    payment_status: c.state === 'captured' ? 'paid' : c.state === 'part_paid' ? 'part_paid' : 'unpaid',
    order_type: 'collection', buzzer_number: null, currency: 'GBP', country: 'GB',
  }]))
}
const UI_TRUCK = {
  id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', mode: 'village', venue_name: 'The Green', logo: null,
  dashboard_token: 'harness', currency: 'GBP', country: 'GB', timezone: null, plan: 'max', show_paid_step: true,
  completion_presses: 'two', takes_cash: true, auto_accept: false, kds_mode: false, feature_overrides: {}, trial_expires_at: null,
  money: { ...FMT, localeByCountry: { GB: 'en-GB' } },
  time: GB_TS, // what /api/dashboard sends (Phase 2B)
}
const dashEvent = (D, day = 'today', id = 'ev-1', start = '12:00', end = '23:59') => ({ id, truck_id: 'test-truck', event_date: D[day], start_time: start, end_time: end, venue_name: 'The Green', town: 'Harnessville', status: day === 'today' ? 'open' : 'confirmed', van_id: null })
const MENU = {
  categories: [{ id: 'c1', name: 'Pizzas' }, { id: 'c3', name: 'Drinks' }],
  items: [{ id: 'i1', name: 'Margherita', price: 9.5, category: 'Pizzas', available: true, modifierGroups: [] }, { id: 'i3', name: 'Coke', price: 1.8, category: 'Drinks', available: true, modifierGroups: [] }],
  bundles: [], upsell_rules: [],
}

let uiMods = null
async function uiBundles() {
  if (uiMods) return uiMods
  const KDS = 'app/dashboard/[token]/kds/page.tsx', DASH = 'app/dashboard/[token]/page.tsx', ADD = 'components/dashboard/AddOrderPanel.tsx'
  const OP = 'app/trucks/[slug]/order/page.tsx', RCPT = 'app/order/[id]/manage/page.tsx', MAN = 'app/manage/[token]/page.tsx'
  uiMods = {
    cards: await kit.bundle('cards', `export * from '@/components/dashboard/OrderCard'\nexport { DayLoadStrip } from '@/components/dashboard/DayLoadStrip'`),
    kds: await kit.bundle('kds', `export { default as Kds } from '@/${KDS}'`, { patches: [{ file: KDS, states: ['truck', 'orders', 'payments', 'heldAuthorisations', 'loading', 'hasLoaded', 'events', 'selectedEventId', 'handoverPref', 'layoutOverride', 'showKdsIntro', 'lastRefresh'] }] }),
    dash: await kit.bundle('dash', `export { default as Dash } from '@/${DASH}'`, { patches: [
      { file: DASH, states: ['truck', 'orders', 'loading', 'authenticated', 'truckMenu', 'todayEvents', 'upcomingEvents', 'selectedEventId', 'eventsLoaded', 'firstOpenChecked', 'fetchedStockKeys', 'payments', 'heldAuthorisations', 'showCompleted', 'activeTab', 'lastRefresh', 'slots'] },
      { file: DASH, from: 'const{token}=use(params)', to: 'const{token}=params' },
    ] }),
    add: await kit.bundle('add', `export * from '@/${ADD}'`, { patches: [{ file: ADD, states: ['manualItems', 'manualEvent', 'eventsLoaded', 'upcomingEvents', 'apiSlots', 'eventTz'] }] }),
    op: await kit.bundle('op', `export { default as OrderPage } from '@/${OP}'`, { patches: [
      { file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'formSheetOpen', 'submitted', 'submittedOrderId', 'submittedConfirmedSlot', 'confirmOrder', 'confirmLoading', 'availableSlots', 'slotsTz', 'slotHour', 'slotMinute', 'asapChosen'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' },
    ] }),
    rcpt: await kit.bundle('rcpt', `export { default as Receipt } from '@/${RCPT}'`, { patches: [{ file: RCPT, states: ['order', 'loading'] }] }),
    man: await kit.bundle('man', `export { __tdReports, __tdSchedule } from '@/${MAN}'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\nexport { TruckTimeContext } from '@/components/TruckTimeContext'`, { patches: [
      { file: MAN, states: ['reportData', 'reportLoaded', 'itemView', 'expandedOrders', 'filterMode', 'events', 'loadingEvents'] },
      { file: MAN, from: 'const exportCSV = () => {', to: 'const exportCSV = globalThis.__tdCsv = () => {' },
      { file: MAN, from: 'const exportItemsCSV = () => {', to: 'const exportItemsCSV = globalThis.__tdItemsCsv = () => {' },
      { file: MAN, append: 'export { ReportsTab as __tdReports, ScheduleTab as __tdSchedule }' },
    ] }),
    print: await kit.bundle('print', `export * from '@/lib/printing/usePrinting'\nexport { __tdStamp } from '@/lib/printing/usePrinting'\nexport * as T from '@/lib/printing/ticket'\nexport * as MAP from '@/lib/printing/mapOrderToTicket'\nexport * as TT from '@/lib/printing/testTicket'`, { patches: [
      { file: 'lib/printing/usePrinting.ts', append: 'export { stampNow as __tdStamp, nowMinsLocal as __tdNowMins }' },
    ] }),
  }
  return uiMods
}

async function screensView(M, D) {
  const m = await uiBundles()
  kit.setDeviceTz(DEVICE_UK)
  const O = ordersFor(D)
  const out = {}
  const safe = (k, f) => { try { out[k] = f() } catch (e) { out[k] = 'ERROR ' + String(e.message || e).slice(0, 200) } }
  const ev = dashEvent(D)
  const payments = Object.fromEntries(Object.entries(CASES).map(([k, c]) => [O[k].order_key, c.ledger]))
  const lastRefresh = new Date()

  // order cards, dashboard and kitchen modes
  for (const [k, o] of Object.entries(O)) for (const kdsMode of [false, true]) {
    safe(`card|${k}|kds=${kdsMode}`, () => kit.textOf(kit.renderStatic(h(m.cards.OrderCard, { order: o, truck: UI_TRUCK, event: ev, slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true }), onEdit() {}, kdsMode, viewMode: 'solo', ledgerRows: CASES[k].ledger, heldAuthorisation: false, effectiveOrderReady: true, readyStepOn: true, vanTakesCash: true }))).text)
  }
  safe('dayLoadStrip', () => kit.textOf(kit.renderStatic(h(m.cards.DayLoadStrip, { slots: ['15:00', '15:30', '16:00', '18:30', '23:40'].map(t => ({ collection_time: t, current_orders: 1, max_orders: 4, available: true })), eventDate: D.today, variant: 'full', time: UI_TRUCK.time }))).text)

  // the kitchen screen
  safe('kds', () => kit.renderWith({ truck: UI_TRUCK, orders: Object.values(O), payments, heldAuthorisations: new Set(), loading: false, hasLoaded: true, events: [ev], selectedEventId: 'ev-1', handoverPref: true, layoutOverride: 'list', showKdsIntro: false, lastRefresh }, h(m.kds.Kds, { token: 'harness' })).text)

  // the dashboard: orders tab with the completed list, and Menu & Stock
  const dashBase = { truck: UI_TRUCK, orders: Object.values(O), loading: false, authenticated: true, truckMenu: MENU, todayEvents: [ev], upcomingEvents: [ev, dashEvent(D, 'tomorrow', 'ev-2', '11:30', '14:00')], selectedEventId: 'ev-1', eventsLoaded: true, firstOpenChecked: true, fetchedStockKeys: new Set(['ev-1']), payments, heldAuthorisations: new Set(), lastRefresh, slots: ['15:00', '15:30', '16:00', '18:30', '23:40'].map(t => ({ collection_time: t, current_orders: 0, max_orders: 4, available: true })) }
  safe('dash|orders', () => kit.renderWith({ ...dashBase, activeTab: 'orders', showCompleted: true }, h(m.dash.Dash, { params: { token: 'harness' } })).text)
  safe('dash|empty', () => kit.renderWith({ ...dashBase, orders: [], activeTab: 'orders' }, h(m.dash.Dash, { params: { token: 'harness' } })).text)
  safe('dash|tomorrowSelected', () => kit.renderWith({ ...dashBase, activeTab: 'orders', selectedEventId: 'ev-2' }, h(m.dash.Dash, { params: { token: 'harness' } })).text)

  // the Add Order panel
  const addProps = { truck: UI_TRUCK, truckMenu: MENU, menuGroups: { Pizzas: [MENU.items[0]], Drinks: [MENU.items[1]] }, itemStocks: [], categoryStocks: [], categoryConfigs: { pizzas: { secs: 300, batch: 4 } }, categoryAllowNotes: {}, orders: [], waitMinutes: 0, token: 'harness', pin: '', todayEvent: ev, categoryOrder: ['Pizzas', 'Drinks'], itemCategoryMap: { Margherita: 'pizzas', Coke: 'drinks' }, showToast() {}, onOrderPlaced() {}, controlledEvent: ev, isActive: true, vanTakesCash: true }
  const apiSlots = ['15:00', '15:20', '15:30', '16:00', '18:30', '23:40'].map(t => ({ collection_time: t, available: true, remaining: 4, is_past: false, too_soon: false, is_grace: false }))
  for (const [k, evx] of [['today', ev], ['tomorrow', dashEvent(D, 'tomorrow', 'ev-2', '11:30', '14:00')], ['yesterday', dashEvent(D, 'yesterday', 'ev-0', '17:00', '21:00')]]) {
    safe(`add|${k}`, () => kit.renderWith({ manualEvent: evx, eventsLoaded: true, upcomingEvents: [evx], apiSlots, manualItems: [{ name: 'Margherita', quantity: 2, unit_price: 9.5, modifiers: [], cartKey: 'k1' }] }, h(m.add.AddOrderPanel, { ...addProps, controlledEvent: evx, todayEvent: evx })).text)
  }

  // the customer order page: an event today, tomorrow and yesterday; the confirmation; the ?confirm= receipt
  const opEvent = (day, start = '12:00', end = '23:59') => ({ id: 'ev-1', date: dmy(D[day]), date_iso: D[day], date_friendly: 'X', start_time: start, end_time: end, venue_name: 'The Green', village: 'Harnessville', notes: '', status: day === 'today' ? 'open' : 'confirmed', collection_interval_mins: 10 })
  const opTruck = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro', ordering_available: true, card_payments_ready: false, money: FMT, time: GB_TS }
  const opMenu = { categories: MENU.categories, items: MENU.items.map(i => ({ ...i })), upsell_rules: [], bundles: [], codes: [] }
  const basket = [{ menuItem: opMenu.items[0], quantity: 2, modifiers: [], specialInstructions: '', cartKey: 'k1' }]
  for (const day of ['today', 'tomorrow', 'yesterday']) {
    const e = opEvent(day)
    safe(`order|${day}`, () => kit.renderWith({ truck: opTruck, menu: opMenu, events: [e], event: e, eventLoading: false, loading: false, basket, formSheetOpen: true, availableSlots: apiSlots, slotsTz: LONDON }, h(m.op.OrderPage, { params: { slug: 'test-kitchen' } })).text)
  }
  safe('order|submitted', () => kit.renderWith({ truck: opTruck, menu: opMenu, events: [opEvent('today')], event: opEvent('today'), eventLoading: false, loading: false, basket, submitted: true, submittedOrderId: '40', submittedConfirmedSlot: '18:30' }, h(m.op.OrderPage, { params: { slug: 'test-kitchen' } })).text)
  safe('order|confirm', () => kit.renderWith({ confirmOrder: { ...O.paid, truck_name: 'Pizza Kitchen', truck_logo: null, money: FMT, time: GB_TS }, confirmLoading: false }, h(m.op.OrderPage, { params: { slug: 'test-kitchen' } }), 'confirm=k').text)

  // the receipt / cancel page
  for (const k of ['paid', 'pending']) {
    safe(`receipt|${k}`, () => kit.renderWith({ order: { ...O[k], truck_name: 'Pizza Kitchen', venue_name: 'The Green', allow_cancellation: true, cancellation_cutoff_mins: 30, money: FMT, time: GB_TS }, loading: false }, h(m.rcpt.Receipt)).text)
  }

  // Reports (default ranges, tables) and both CSVs; Manage › Schedule's event list
  const settings = require('./_country-settings-gb.cjs').gbFromSeed()
  const inManage = el => h(m.man.CountrySettingsProvider, { settings }, h(m.man.TruckTimeContext.Provider, { value: GB_TS }, el))
  const repOrders = Object.values(O)
  const reportData = { totalOrders: repOrders.length, totalRevenue: 134.5, avgOrder: 26.9, topItems: [], dealsRedeemed: 0, dealSavings: 0, upsellRevenue: 0, whatsappStats: null, orders: repOrders, eventsMap: { 'ev-1': { venue_name: 'The Green', town: 'Harnessville', van_id: null } }, eventsByDate: {}, itemCategories: {}, categoryOrder: [] }
  const repTruck = { ...UI_TRUCK, plan: 'max', timezone: null }
  for (const view of ['orders', 'items']) {
    safe(`reports|${view}`, () => { const r = kit.renderWith({ reportData, reportLoaded: true, itemView: view, expandedOrders: new Set(repOrders.map(o => o.order_key)) }, inManage(h(m.man.__tdReports, { truck: repTruck, api: async () => ({}) }))); return { text: r.text, attrs: r.attrs.filter(a => /^(value|min|max)=\d{4}-/.test(a)) } })
  }
  safe('reports|csv', () => {
    const files = []
    const saved = { Blob: globalThis.Blob, URL: globalThis.URL, document: globalThis.document }
    globalThis.Blob = class { constructor(parts) { this.parts = parts } }
    globalThis.URL = { createObjectURL: b => { files.push({ text: b.parts.join('') }); return 'blob:x' }, revokeObjectURL() {} }
    globalThis.document = { createElement: () => ({ click() {}, set download(v) { files[files.length - 1].name = v } }) }
    try {
      kit.renderWith({ reportData, reportLoaded: true, itemView: 'orders' }, inManage(h(m.man.__tdReports, { truck: repTruck, api: async () => ({}) })))
      globalThis.__tdCsv(); globalThis.__tdItemsCsv()
    } finally { Object.assign(globalThis, saved); if (!saved.document) delete globalThis.document }
    return files
  })
  const schedEvents = ['yesterday', 'today', 'tomorrow', 'plus5'].map((day, i) => ({ id: `se-${i}`, truck_id: 'test-truck', event_date: D[day], start_time: '17:00:00', end_time: '21:00:00', venue_name: 'The Green', town: 'Harnessville', postcode: null, status: day === 'yesterday' ? 'closed' : 'confirmed', event_deals: [], van_id: null }))
  safe('schedule', () => { const noop = () => {}; return kit.renderWith({ events: schedEvents, loadingEvents: false }, inManage(h(m.man.__tdSchedule, { isActive: true, section: 'events', onSectionChange: noop, truck: repTruck, token: 'harness', bundles: [], categories: [], api: async () => ({}), showToast: noop, onTruckUpdate: noop, onVerifySuccess: noop, onSwitchTab: noop, onOpenSocial: noop, pendingVerifyEvents: null, onClearPendingVerify: noop, onPendingCount: noop, onEventsSaved: noop, notices: [] }))).text })

  // tickets: the printed-at stamp the printer hook writes, a ticket through the real mapper, the test ticket
  safe('ticket|stamp', () => `${m.print.__tdStamp(UI_TRUCK)}|${m.print.__tdNowMins(UI_TRUCK)}`)
  safe('ticket|lines', () => m.print.T.buildTicketLines(m.print.MAP.mapOrderToTicket({ order: O.paid, truck: UI_TRUCK, event: ev, ledgerRows: CASES.paid.ledger, printedLabel: m.print.__tdStamp(UI_TRUCK) }), { paper_width: 80, show_phone: true }).map(l => l.text).filter(Boolean))
  safe('ticket|test', () => Buffer.from(m.print.TT.renderTestTicket({ truckName: 'Pizza Kitchen', paper: 80, time: GB_TS })).toString('latin1').replace(/[^\x20-\x7e\n]/g, '').split('\n').map(l => l.trim()).filter(Boolean).join(' | '))
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 9 · THE DASHBOARD API'S "now" (B1) — the one UK change allowed through ALL of BST
// `nowMins` (app/api/dashboard/route.ts) was the server's UTC clock. ⚠️ It feeds TWO things, not the one
// docs/time-and-dates-utc-sites.md named: the earliest slot of an event with no start time (which can never
// show — the route builds slots only when the event has both times) AND which of the dashboard's slots are
// marked PAST (`is_past`) — an hour late all through BST. The BEFORE snapshot never called this route, so
// its "before" is the route as it is with that ONE line put back as it was (`new Date().getHours()…` on a
// UTC server). The run requires: identical in GMT; in BST, moved only in `is_past`, and to London's clock.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const ACTOR_PATCH = { file: 'lib/audit/actor.ts', from: 'const supabaseAuth = await createSupabaseServerClient()', to: 'const supabaseAuth = { auth: { getUser: async () => ({ data: { user: null } }) } }' }
let dashApiMods
async function dashApiView(D) {
  dashApiMods ??= {
    now: await kit.bundle('dashapi', `export { GET } from '@/app/api/dashboard/route'`, { patches: [ACTOR_PATCH] }),
    utcLine: await kit.bundle('dashapi-utc', `export { GET } from '@/app/api/dashboard/route'`, { patches: [ACTOR_PATCH,
      { file: 'app/api/dashboard/route.ts', from: 'const nowMins = getNowMinsInTz(tz)', to: 'const nowMins = new Date().getHours() * 60 + new Date().getMinutes()' }] }),
  }
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  kit.setDeviceTz(SERVER)
  const out = {}
  for (const [k, start] of [['withStart', '12:00:00'], ['noStart', null]]) {
    for (const [v, mod] of Object.entries(dashApiMods)) {
      globalThis.__harnessDb = kit.fakeDb({ trucks: [{ ...GB_TRUCK, dashboard_token: 'harness' }], country_settings: [GB_SETTINGS_ROW],
        truck_events: [{ id: 'ev-d', truck_id: 'test-truck', event_date: D.today, start_time: start, end_time: '23:59:00', status: 'open', van_id: null, venue_name: 'The Green', town: 'Harnessville' }],
        orders: [], collection_times: [], menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas', prep_secs: 300, batch_size: 4, counts_toward_capacity: true, is_active: true, sort_order: 1 }], menu_items_db: [], truck_vans: [], order_payments: [] })
      try {
        const res = await kit.quietAsync(() => mod.GET(new NextRequest(`http://localhost/api/dashboard?token=harness&date=${D.today}&event_id=ev-d`)))
        const body = await res.json()
        out[`${k}|${v}`] = `${res.status} ${(body.slots || []).map(x => `${x.collection_time}${x.is_past ? ' past' : ''}${x.available ? '' : ' full'}`).join(', ')}`
      } finally { delete globalThis.__harnessDb }
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 10 · US TRUCKS — New York and Los Angeles at 20:00 local (already the NEXT day in UTC)
// 🔴 TRANSLATION: a truck's decisions are a function of ITS wall clock. So a US truck at 20:00 its time on
// Friday 9 October must decide exactly what the GB truck decides at 20:00 London on the same date — slots,
// seating, refusals, auto-accept, the scheduler's opens and closes. The DISPLAY is then checked against the
// US settings row: 12-hour times, month-first dates, Sunday-first weeks. A US truck with no timezone takes
// its country's default (America/New_York).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const US_AT_8PM = {
  gbRef: { iso: '2026-10-09T19:00:00.000Z', zone: 'Europe/London' },        // 20:00 BST
  ny:    { iso: '2026-10-10T00:00:00.000Z', zone: 'America/New_York' },     // 20:00 EDT — UTC is Saturday
  la:    { iso: '2026-10-10T03:00:00.000Z', zone: 'America/Los_Angeles' },  // 20:00 PDT — UTC is Saturday
  usNoTz:{ iso: '2026-10-10T00:00:00.000Z', zone: 'America/New_York' },     // a US truck with timezone null
}
function daysIn(iso, tz) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const shift = n => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
  return { today: ymd, yesterday: shift(-1), tomorrow: shift(1), plus5: shift(5), minus8: shift(-8) }
}
const truckFor = key => key === 'gbRef' ? GB_TRUCK
  : { ...GB_TRUCK, id: `us-${key}`, slug: `us-${key}`, country: 'US', currency: 'USD', timezone: key === 'usNoTz' ? null : US_AT_8PM[key].zone }
const rowsFor = () => [GB_SETTINGS_ROW, US_SETTINGS_ROW]

async function usView() {
  const fails = []; const proof = {}
  const check = (label, ok, detail) => { if (!ok) fails.push(`${label}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`) }
  const helpers = helpersMod ??= await kit.bundle('helpers', [
    `export * as T from '@/lib/time-utils'`, `export * as SU from '@/lib/slot-utils'`, `export * as P from '@/lib/prep-utils'`,
    `export * as ED from '@/lib/event-display'`, `export * as U from '@/lib/utils'`, `export * as W from '@/lib/weekly-post/week'`,
    `export * as CT from '@/lib/weekly-post/caption-template'`, `export * as WU from '@/lib/whatsapp/usage'`,
    `export * as DE from '@/lib/provision-demo-event'`, `export * as PL from '@/lib/schedule-graphics/places'`,
    `export * as TT from '@/lib/truck-time'`,
  ].join('\n'))
  slotsMod ??= await kit.bundle('slots', `export { GET } from '@/app/api/slots/[truckId]/route'\nexport { buildSlotAvailability } from '@/lib/slot-availability'\nexport { getNowMinsInTz } from '@/lib/time-utils'`)
  ordersMod ??= await kit.bundle('orders', `export { decideAutoAccept } from '@/lib/orders/auto-accept'\nexport { placeOrderInSlotLocked } from '@/lib/orders/place-in-slot'`)
  eventsMod ??= await kit.bundle('events', `export { GET } from '@/app/api/events/route'`)
  emailMod ??= await kit.bundle('email', `export * as E from '@/lib/email'`)
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const decisions = {}
  for (const [key, at] of Object.entries(US_AT_8PM)) {
    kit.setNow(at.iso); kit.setDeviceTz(SERVER)
    const truck = truckFor(key)
    const D = daysIn(at.iso, at.zone)
    const r = {}
    // the one rule
    globalThis.__harnessDb = kit.fakeDb({ country_settings: rowsFor() })
    let ts
    try { ts = await helpers.TT.truckTimeSettings(truck) } finally { delete globalThis.__harnessDb }
    check(`${key}: the truck's zone`, ts.timeZone === at.zone, ts)
    r.today = helpers.T.getLocalDateInTz(ts.timeZone)
    check(`${key}: the truck's today is Friday 9 October (UTC: ${new Date(at.iso).toISOString().slice(0, 10)})`, r.today === '2026-10-09', r.today)
    // slots — the real route
    const tables = slotTables(D, truck); tables.country_settings = rowsFor()
    globalThis.__harnessDb = kit.fakeDb(tables)
    try {
      for (const [k, q] of [['today', `date=${D.today}`], ['tomorrow', `date=${D.tomorrow}`], ['noDate', '']]) {
        const res = await kit.quietAsync(() => slotsMod.GET(new NextRequest(`http://localhost/api/slots/${truck.id}?${q}`), { params: Promise.resolve({ truckId: truck.id }) }))
        const body = await res.json()
        r[`slots|${k}`] = (body.slots || []).map(s => `${s.collection_time}${s.is_past ? ' past' : ''}${s.too_soon ? ' soon' : ''}${s.is_grace ? ' grace' : ''}${s.available ? '' : ' full'}`).join(', ')
        if (k === 'today') r.slotsTz = body.tz
      }
    } finally { delete globalThis.__harnessDb }
    // the engine direct
    const times = ['19:30', '19:50', '20:00', '20:10', '20:30'].map(t => ({ collection_time: t, production_slot: t }))
    r.engine = slotsMod.buildSlotAvailability({ times, productionSlotUnits: { '20:10': { pizzas: 4 } }, catConfigs: { pizzas: { secs: 300, batch: 4, countsToCapacity: true } }, kitchenCapacity: 8, capacityWindowMins: 5, date: D.today, nowMins: slotsMod.getNowMinsInTz(ts.timeZone), earliestCollectionMins: 17 * 60, eventStartMins: 17 * 60, eventEndMins: 22 * 60, basketByCat: { pizzas: 6 }, tz: ts.timeZone, displayIntervalMins: 10 })
      .map(s => `${s.collection_time}:${s.available ? 'ok' : 'no'}${s.is_past ? ':past' : ''}`).join(' ')
    // auto-accept and place-in-slot
    for (const day of ['today', 'tomorrow']) for (const [ck, cfg] of Object.entries({ hours2: { enabled: true, deadlineType: 'hours_before', deadlineValue: 2, pastAction: 'force_pending' }, cutoff16: { enabled: true, deadlineType: 'daily_cutoff', deadlineValue: 16 * 60, pastAction: 'force_pending' }, cutoff2130: { enabled: true, deadlineType: 'daily_cutoff', deadlineValue: 21 * 60 + 30, pastAction: 'force_pending' } })) {
      r[`auto|${day}|${ck}`] = JSON.stringify(ordersMod.decideAutoAccept({ truck, orderLines: [{ name: 'Margherita' }], autoAcceptByName: { Margherita: true }, preorderByName: { Margherita: cfg }, eventDate: D[day], eventStartMins: 21 * 60, offlineNoAutoAcceptUntil: null, notes: null, items: [], deals: [], timeZone: ts.timeZone }))
    }
    globalThis.__harnessDb = kit.fakeDb({ collection_times: [], orders: [], production_slot_usage: [], cooking_reservations: [] })
    try {
      for (const req of [null, '19:00', '21:30']) {
        const pr = await kit.quietAsync(() => ordersMod.placeOrderInSlotLocked(truck.id, D.today, 'ev-t', req, [{ name: 'Margherita', quantity: 6 }], { Margherita: 'pizzas' }, { pizzas: { secs: 300, batch: 4, countsToCapacity: true } }, '12:00:00', '23:59:00', 10, 10, 8, 5, null, false, ts.timeZone))
        r[`place|${req ?? 'asap'}`] = `${pr.finalSlot}|${pr.booked}`
      }
    } finally { delete globalThis.__harnessDb }
    // the scheduler — its writes, per event (ids carry no truck, so the four runs compare directly)
    globalThis.Deno = { env: { get: () => 'http://127.0.0.1:9' }, serve: hnd => { globalThis.__denoHandler = hnd } }
    const ev = (id, date, start, end, status, extra = {}) => ({ id, truck_id: truck.id, van_id: 'van-1', event_date: date, start_time: start, end_time: end, status, auto_open: true, auto_close: true, ...extra })
    const writes = []
    globalThis.__harnessDb = kit.fakeDb({ trucks: [truck], country_settings: rowsFor(), truck_events: [
      ev('open-y', D.yesterday, '17:00:00', '21:00:00', 'open'),
      ev('conf-t-1900', D.today, '19:00:00', '23:00:00', 'confirmed'), ev('conf-t-2000', D.today, '20:00:00', '23:00:00', 'confirmed'),
      ev('conf-t-2100', D.today, '21:00:00', '23:00:00', 'confirmed'),
      ev('open-t-1930', D.today, '12:00:00', '19:30:00', 'open'), ev('open-t-2200', D.today, '17:00:00', '22:00:00', 'open'),
      ev('open-t-manual', D.today, '12:00:00', '15:00:00', 'open', { auto_close: false }),
      ev('conf-m-0015', D.tomorrow, '00:15:00', '02:00:00', 'confirmed'), ev('open-m', D.tomorrow, '11:00:00', '14:00:00', 'open'),
    ] }, writes)
    try {
      await kit.bundle(`edge-us-${key}`, `import '@/supabase/functions/auto-event-scheduler/index.ts'`)
      await kit.quietAsync(() => globalThis.__denoHandler(new Request('http://localhost/')))
      r.edge = writes.map(w => `${w.table}:${Object.keys(w.patch || {}).sort().join('+')}:${w.ids.slice().sort().join(',')}`)
    } finally { delete globalThis.__harnessDb; delete globalThis.__denoHandler }
    decisions[key] = r
    // ── DISPLAY in the truck's own settings ──
    if (key === 'gbRef') continue
    const d = {}
    d.time = helpers.T.formatTime('18:30', ts); d.timeHour = helpers.T.formatTime('18:00:00', ts); d.range = helpers.T.formatTimeRange('17:00', '21:30', ts)
    d.numeric = helpers.T.formatNumericDate(D.today, ts); d.short = helpers.T.formatYmd(D.today, ts, { weekday: 'short', day: 'numeric', month: 'short' })
    d.labelToday = helpers.ED.eventDateLabel(D.today, ts); d.labelTomorrow = helpers.ED.eventDateLabel(D.tomorrow, ts, 'compact'); d.ordinal = helpers.T.formatOrdinalDate(D.plus5, ts)
    d.clock = helpers.T.formatInstantClock(new Date(), ts)
    const wk = { timeZone: ts.timeZone, weekStart: ts.weekStart }
    d.week = helpers.W.weekRange('this', new Date(), wk); d.weekToday = helpers.W.todayInWeekTz(new Date(), wk)
    check(`${key}: 12-hour time`, d.time === '6:30pm' && d.timeHour === '6pm' && d.range === '5pm – 9:30pm', d)
    check(`${key}: month-first numeric date`, d.numeric === '10/09/2026', d.numeric)
    check(`${key}: month-first short date`, d.short === 'Fri, Oct 9', d.short)
    check(`${key}: "today" label on the truck's clock`, d.labelToday === 'Today, October 9th' && d.labelTomorrow === 'Tomorrow', d)
    check(`${key}: ordinal date`, d.ordinal === 'Wednesday, October 14th', d.ordinal)
    check(`${key}: the clock now`, d.clock === '8pm', d.clock)
    check(`${key}: the week starts on Sunday`, d.week.start === '2026-10-04' && d.week.end === '2026-10-10' && d.weekToday === '2026-10-09', d.week)
    // the order page's event list (real route)
    globalThis.__harnessDb = kit.fakeDb({ trucks: [truck], country_settings: rowsFor(), truck_vans: [], private_event_links: [], truck_events: [
      { id: 't', truck_id: truck.id, event_date: D.today, start_time: '17:00:00', end_time: '23:00:00', venue_name: 'Union Square', town: 'NYC', postcode: null, notes: null, status: 'open', is_private: false, van_id: null, event_type_id: null, opened_at: null, collection_interval_mins: null },
      { id: 'm', truck_id: truck.id, event_date: D.tomorrow, start_time: '11:30:00', end_time: '14:00:00', venue_name: 'Union Square', town: 'NYC', postcode: null, notes: null, status: 'confirmed', is_private: false, van_id: null, event_type_id: null, opened_at: null, collection_interval_mins: null },
    ] })
    try {
      const res = await kit.quietAsync(() => eventsMod.GET(new NextRequest(`http://localhost/api/events?truck=${truck.slug}`)))
      const body = await res.json()
      d.events = (body.events || []).map(e => `${e.date_iso}|${e.date_friendly}`)
      check(`${key}: the order page's labels`, d.events.includes('2026-10-09|Today · Friday, October 9th') && d.events.includes('2026-10-10|Tomorrow · Saturday, October 10th') && d.events.length === 2, d.events)
      check(`${key}: /api/events sends the truck's settings`, body.time && body.time.timeZone === at.zone && body.time.timeFormat === '12h', body.time)
    } finally { delete globalThis.__harnessDb }
    // an email and a ticket
    const conf = emailMod.E.formatConfirmationEmail({ orderId: '40', orderKey: 'k', truckName: 'Pizza Kitchen', customerName: 'Sam', slot: '18:30', items: [{ name: 'Margherita', quantity: 1, unit_price: 9.5, modifiers: [] }], deals: [], discountAmt: 0, total: 9.5, notes: null, venueName: 'Union Square', venueTown: 'NYC', allowCancellation: false, cancellationCutoffMins: 0, baseUrl: 'https://www.hatchgrab.com', truckSlug: truck.slug, variant: 'confirmation', autoAccepted: true, money: { currency: 'USD', locale: 'en-US' }, time: ts }).text
    check(`${key}: the confirmation email's collection time`, conf.includes('Collection time: 6:30pm'), conf.split('\n').find(l => /Collection/.test(l)))
    d.email = conf.split('\n').find(l => /Collection/.test(l))
    // the printed ticket and the kitchen's order card, for the same order
    const ui = await uiBundles()
    kit.setDeviceTz(at.zone)
    const usTruck = { ...UI_TRUCK, ...truck, money: { currency: 'USD', locale: 'en-US', localeByCountry: { US: 'en-US' } }, time: ts }
    const order = { ...ordersFor(D).paid, currency: 'USD', country: 'US' }
    const lines = ui.print.T.buildTicketLines(ui.print.MAP.mapOrderToTicket({ order, truck: usTruck, event: dashEvent(D), ledgerRows: CASES.paid.ledger, printedLabel: ui.print.__tdStamp(usTruck) }), { paper_width: 80, show_phone: true }).map(l => l.text).filter(Boolean)
    d.ticket = lines.find(l => /COLLECT/.test(l))
    check(`${key}: the ticket's collection time`, /COLLECT 6:30pm/.test(d.ticket || ''), d.ticket)
    check(`${key}: the ticket's printed-at stamp`, ui.print.__tdStamp(usTruck) === '8pm' && ui.print.__tdNowMins(usTruck) === 20 * 60, ui.print.__tdStamp(usTruck))
    const card = kit.textOf(kit.renderStatic(h(ui.cards.OrderCard, { order, truck: usTruck, event: dashEvent(D), slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true }), onEdit() {}, kdsMode: false, viewMode: 'solo', ledgerRows: CASES.paid.ledger, heldAuthorisation: false, effectiveOrderReady: true, readyStepOn: true, vanTakesCash: true }))).text
    check(`${key}: the order card's collection time`, card.includes('6:30pm') && !card.includes('18:30'), card.slice(0, 200))
    kit.setDeviceTz(SERVER)
    proof[key] = d
  }
  // ── translation: every US decision equals the GB truck's at 20:00 London on the same calendar ──
  for (const key of ['ny', 'la', 'usNoTz']) {
    for (const [k, v] of Object.entries(decisions.gbRef)) {
      if (k === 'slotsTz') continue
      check(`${key}: ${k} equals the GB truck's at 20:00 London`, JSON.stringify(decisions[key][k]) === JSON.stringify(v), { us: decisions[key][k], gb: v })
    }
    check(`${key}: /api/slots names the truck's zone`, decisions[key].slotsTz === US_AT_8PM[key].zone, decisions[key].slotsTz)
  }
  // and the decisions are the right ones, by hand, for the record
  const g = decisions.gbRef
  check('20:00: the scheduler opens 19:00 and 20:00 today, closes yesterday and 19:30, leaves 21:00, 22:00, manual and tomorrow',
    JSON.stringify(g.edge) === JSON.stringify(['truck_events:opened_at+status:conf-t-1900,conf-t-2000', 'truck_events:closed_at+status:open-t-1930,open-y']), g.edge)
  check('20:00: slots before 20:00 are past', /19:50 past/.test(g['slots|today']) && !/20:10 past/.test(g['slots|today']), g['slots|today'])
  check('20:00: no date given ⇒ today\'s event', g['slots|noDate'] === g['slots|today'], g['slots|noDate'])
  return { fails, proof, decisions }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ALLOWED UK DIFFERENCES — Dominic, 10 October 2026: "Each UK change is allowed only inside its window
// (00:00–01:00 BST for the date sites; all of BST for the dashboard's earliest-slot "now") and must be
// named in the harness as an allowed difference. Anything else that moves still fails the run."
// Each entry names its site (docs/time-and-dates-utc-sites.md), the instants it may move at, the snapshot
// leaves it covers, and what the new value must BE — an allowed difference that is wrong still fails.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const fmtLong = ymd => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ymd + 'T00:00:00Z'))
const ALLOWED = [
  { id: 'A1', site: 'app/api/events/route.ts — the order page\'s Today / Tomorrow labels', moments: ['after0030'], path: /^events\/\d+$/,
    expect: (v, D) => !v.startsWith(D.today + '|') || v.includes('|Today · ') ? (!v.startsWith(D.tomorrow + '|') || v.includes('|Tomorrow · ')) : false },
  { id: 'A2', site: 'lib/whatsapp-classifier.ts — the WhatsApp reply\'s DATE REFERENCE', moments: ['after0030'], path: /^prompts\/whatsappPrompt$/,
    expect: (v, D) => v.includes(`Today = ${D.today} `) && v.includes(`Tomorrow = ${D.tomorrow} `) },
  { id: 'A3', site: 'lib/schedule-extract.ts — the schedule-import prompt\'s "Today is"', moments: ['after0030'], path: /^prompts\/schedulePrompt$/,
    expect: (v, D) => v.includes(`Today is ${fmtLong(D.today).replace(/^(\w+) /, '$1, ')}`) },
  { id: 'A4', site: 'app/api/slots/[truckId]/route.ts — the default date of a request that names none', moments: ['after0030'], path: /^slots\/noDate$/,
    expect: (v, D, after) => v === after.slots.today },
  { id: 'C1', site: 'app/manage/[token]/page.tsx — Reports\' default range (last 7 days to yesterday) and its CSV names', moments: ['after0030'],
    path: /^screens\/reports\|(orders|items)\/attrs\/\d+$|^screens\/reports\|csv\/\d+\/name$/,
    expect: (v, D) => { const from = addDays(D.today, -7), to = addDays(D.today, -1); return v.startsWith('max=') || v === `value=${from}` || v === `value=${to}` || v.endsWith(`-${from}-to-${to}.csv`) } },
  { id: 'C2', site: 'components/dashboard/AddOrderPanel.tsx — Add Order\'s Today / Tomorrow labels and its "future event" / "not open yet" banners (also inside the dashboard)', moments: ['after0030'],
    path: /^screens\/(add\|(tomorrow|yesterday)|dash\|tomorrowSelected)$/,
    expect: (v, D, after, p) => p.endsWith('yesterday') ? !v.includes("Today's event") && v.includes('Fri 9 Oct') : v.includes('Tomorrow · 11:30–14:00') },
  // NOT A UK CHANGE — named so it is visible rather than hidden. `calcReadyTime` runs ONLY in a browser (Add
  // Order); the snapshot also evaluates it on a UTC host, where it used to read that host's clock. It now
  // reads the truck's clock wherever it runs, so the UTC-host value must equal the UK device's.
  { id: 'ENV', site: 'lib/prep-utils.ts calcReadyTime evaluated on a UTC host (browser-only helper)', moments: Object.keys(MOMENTS), path: /^helpers\/utcServer\/calcReadyTime$/,
    expect: (v, D, after) => v === after.helpers.ukDevice.calcReadyTime },
]
function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
function leaves(o, p = '', out = {}) {
  if (o && typeof o === 'object') { const ks = Object.keys(o); if (!ks.length) out[p] = JSON.stringify(o); for (const k of ks) leaves(o[k], p ? `${p}/${k}` : k, out) } else out[p] = o === undefined ? '«undefined»' : JSON.stringify(o)
  return out
}
function compare(before, after) {
  const fails = [], allowed = {}
  let total = 0
  for (const mk of Object.keys(MOMENTS)) {
    const A = leaves(before[mk]), B = leaves(after[mk])
    const D = after[mk].days
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      total++
      if (A[k] === B[k]) continue
      const rule = ALLOWED.find(r => r.path.test(k))
      const v = B[k] === undefined ? undefined : JSON.parse(B[k] === '«undefined»' ? 'null' : B[k])
      if (!rule) { fails.push(`${mk} ${k}: moved and no allowance names it\n     before ${String(A[k]).slice(0, 300)}\n     after  ${String(B[k]).slice(0, 300)}`); continue }
      if (!rule.moments.includes(mk)) { fails.push(`${mk} ${k}: ${rule.id} may move only at ${rule.moments.join(', ')}`); continue }
      if (typeof v !== 'string' || !rule.expect(v, D, after[mk], k)) { fails.push(`${mk} ${k}: ${rule.id} moved to a value that is not the right one\n     after ${String(B[k]).slice(0, 300)}`); continue }
      ;(allowed[rule.id] ??= []).push(`${mk} ${k}`)
    }
  }
  return { fails, allowed, total }
}

async function snapshot() {
  const snap = {}
  for (const [mk, iso] of Object.entries(MOMENTS)) {
    kit.setNow(iso)
    const D = londonDays(iso)
    snap[mk] = {
      days: D,
      helpers: await helpersView(mk, D),
      slots: await slotsView(mk, D),
      orders: await ordersView(mk, D),
      edge: await edgeView(mk, D),
      events: await eventsView(mk, D),
      prompts: await promptsView(mk, D),
      emails: await emailsView(mk, D),
      screens: await screensView(mk, D),
    }
  }
  return snap
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// 11 · THE TWO §7 FIXES (Dominic, 10 October 2026: "Yes to both §7 fixes … Name each … as an allowed UK
// difference for all of BST only, and check the new value"). Neither route was in the BEFORE snapshot, so —
// like B1 — each route's "before" is the route as it is with its ONE old line put back.
//
// CXL · app/api/orders/cancel — the cutoff was `new Date(\`${date}T${slot}\`)` on a UTC server.
//   Probed minute by minute around the cutoff: the first minute the server refuses. Required:
//   GMT identical; BST exactly 60 minutes EARLIER, at the true London cutoff; and at every probed minute the
//   server refuses exactly when the receipt page says "The cancellation window has passed".
//   US: a New York truck's cutoff falls at its own local time (it was four hours early).
// WAS · app/api/manage get_report — WhatsApp replies were counted between `${day}T00:00:00` and
//   `${day}T23:59:59` with no zone (UTC days). Required: every reply counted on its London day; the old and new
//   answers differ only for a reply logged 00:00–01:00 London in BST, or in a day's final second (23:59:59.x),
//   which the old upper bound counted on no day — Dominic chose to count it ("Next midnight; allow it").
//   US: a New York truck's days are bounded at New York midnight.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
const CANCEL_STOP = { file: 'app/api/orders/cancel/route.ts', from: '    // Cancel the order\n', to: '    return NextResponse.json({ __tdAllowed: true })\n    // Cancel the order\n' }
let cancelMods
async function cancelView() {
  cancelMods ??= {
    now: await kit.bundle('cancel', `export { POST } from '@/app/api/orders/cancel/route'`, { patches: [CANCEL_STOP] }),
    utcLine: await kit.bundle('cancel-utc', `export { POST } from '@/app/api/orders/cancel/route'`, { patches: [CANCEL_STOP,
      { file: 'app/api/orders/cancel/route.ts', from: 'const slotTime = instantOfLocal(order.event_date, effectiveSlot, await truckTimeZone(truck))', to: 'const slotTime = new Date(`${order.event_date}T${effectiveSlot}`).getTime()' }] }),
  }
  const ui = await uiBundles()
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const fails = [], lines = []
  const CASES = [
    // [label, truck, date, slot, end_time, device zone for the receipt, true cutoff (UTC, from the known offset)]
    ['GB in BST', GB_TRUCK, '2026-10-09', '19:00', '21:00:00', LONDON, '2026-10-09T17:30:00.000Z', 'bst'],
    ['GB in GMT', GB_TRUCK, '2026-11-13', '19:00', '21:00:00', LONDON, '2026-11-13T18:30:00.000Z', 'gmt'],
    ['GB in BST, no slot (event end 21:00)', GB_TRUCK, '2026-10-09', null, '21:00:00', LONDON, '2026-10-09T19:30:00.000Z', 'bst'],
    ['New York (EDT)', { ...GB_TRUCK, id: 'us-ny', country: 'US', timezone: 'America/New_York' }, '2026-10-09', '19:00', '21:00:00', 'America/New_York', '2026-10-09T22:30:00.000Z', 'us'],
  ]
  const ts = t => t.country === 'US' ? tsOf(US_SETTINGS_ROW, t.timezone) : GB_TS
  for (const [label, truck, date, slot, end, device, cutoffIso, kind] of CASES) {
    const cutoff = Date.parse(cutoffIso)
    const first = {}
    let mismatch = null
    for (let t = cutoff - 300 * 60000; t <= cutoff + 300 * 60000; t += 60000) {
      kit.setNow(new Date(t).toISOString())
      for (const [v, mod] of Object.entries(cancelMods)) {
        kit.setDeviceTz(SERVER)
        globalThis.__harnessDb = kit.fakeDb({ country_settings: [GB_SETTINGS_ROW, US_SETTINGS_ROW], orders: [{
          order_key: 'k-cxl', id: '40', truck_id: truck.id, event_date: date, slot, status: 'confirmed', event_id: 'ev-1',
          trucks: { name: truck.name, allow_customer_cancellation: true, cancellation_cutoff_mins: 30, timezone: truck.timezone ?? null, country: truck.country },
          truck_events: { end_time: end },
        }] })
        let refused
        try {
          const res = await kit.quietAsync(() => mod.POST(new NextRequest('http://localhost/api/orders/cancel', { method: 'POST', body: JSON.stringify({ order_key: 'k-cxl' }) })))
          const body = await res.json()
          if (res.status === 409) refused = true
          else if (body.__tdAllowed) refused = false
          else throw new Error(`unexpected ${res.status} ${JSON.stringify(body).slice(0, 120)}`)
        } finally { delete globalThis.__harnessDb }
        if (refused && first[v] === undefined) first[v] = t
        // the receipt page, on the customer's device, at the same minute (it decides only with a slot)
        if (v === 'now' && slot) {
          kit.setDeviceTz(device)
          const r = kit.renderWith({ order: { id: '40', status: 'confirmed', customer_name: 'Sam', slot, event_date: date, items: [], deals: [], total: 9.5, payment_status: 'unpaid', truck_name: truck.name, venue_name: 'The Green', allow_cancellation: true, cancellation_cutoff_mins: 30, money: FMT, time: ts(truck) }, loading: false }, h(ui.rcpt.Receipt)).text
          const pageSaysPast = r.includes('The cancellation window has passed')
          if (pageSaysPast !== refused && !mismatch) mismatch = `${new Date(t).toISOString()}: server ${refused ? 'refuses' : 'allows'}, receipt ${pageSaysPast ? 'says past' : 'offers Cancel'}`
        }
      }
    }
    const want = cutoff + 60000 // `now > cutoff` refuses from the first minute after it
    const iso = x => x === undefined ? 'never' : new Date(x).toISOString().slice(0, 16) + 'Z'
    const moved = first.now !== first.utcLine
    if (first.now !== want) fails.push(`CXL ${label}: first refusal ${iso(first.now)}, expected ${iso(want)}`)
    if (mismatch) fails.push(`CXL ${label}: server and receipt disagree — ${mismatch}`)
    if (kind === 'gmt' && moved) fails.push(`CXL ${label}: moved in GMT (${iso(first.utcLine)} → ${iso(first.now)})`)
    if (kind === 'bst' && first.utcLine - first.now !== 60 * 60000) fails.push(`CXL ${label}: BST cutoff should be exactly 60 min earlier (${iso(first.utcLine)} → ${iso(first.now)})`)
    lines.push(`${label.padEnd(36)} refused from ${iso(first.now)} (was ${iso(first.utcLine)})${kind === 'gmt' ? ' — identical' : kind === 'bst' ? ' — 60 min earlier, the true London cutoff' : ' — New York 18:30, was four hours early'}${slot ? '; receipt agrees at every minute' : ''}`)
  }
  kit.setDeviceTz(SERVER)
  return { fails, lines }
}

const ACCESS_HARNESS = { file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: "const access = { ok: true as const, role: 'owner' as const, userId: null, operatorId: null, via: 'harness' } as any" }
let waMods
async function waStatsView() {
  waMods ??= {
    now: await kit.bundle('wa', `export { POST } from '@/app/api/manage/route'`, { patches: [ACCESS_HARNESS] }),
    utcLine: await kit.bundle('wa-utc', `export { POST } from '@/app/api/manage/route'`, { patches: [ACCESS_HARNESS,
      { file: 'app/api/manage/route.ts', from: ".gte('created_at', waStart)\n        .lt('created_at', waEnd),", 
      // The old line, with its two zone-less bounds written as the exact UTC instants Postgres reads them as
      // (the fake database compares strings, and '…T23:59:59' vs '…T23:59:59.000Z' would compare unequal).
      to: ".gte('created_at', new Date(`${waFrom}T00:00:00Z`).toISOString())\n        .lte('created_at', new Date(`${waTo}T23:59:59Z`).toISOString())," }] }),
  }
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  kit.setDeviceTz(SERVER)
  const fails = [], lines = []
  const ny = { ...GB_TRUCK, id: 'us-ny', country: 'US', timezone: 'America/New_York', dashboard_token: 'harness-ny' }
  const CASES = [
    ['GB, a BST day', { ...GB_TRUCK, dashboard_token: 'harness' }, '2026-10-09', LONDON, 'bst',
      ['2026-10-08T22:59:59.000Z', '2026-10-08T23:00:00.000Z', '2026-10-08T23:30:00.000Z', '2026-10-09T00:00:00.000Z', '2026-10-09T12:00:00.000Z', '2026-10-09T22:59:59.500Z', '2026-10-09T23:00:00.000Z', '2026-10-09T23:30:00.000Z', '2026-10-09T23:59:59.000Z']],
    ['GB, a GMT day', { ...GB_TRUCK, dashboard_token: 'harness' }, '2026-11-13', LONDON, 'gmt',
      ['2026-11-12T23:59:59.000Z', '2026-11-13T00:00:00.000Z', '2026-11-13T12:00:00.000Z', '2026-11-13T23:59:59.000Z', '2026-11-13T23:59:59.500Z', '2026-11-14T00:00:00.000Z']],
    ['New York, an EDT day', ny, '2026-10-09', 'America/New_York', 'us',
      ['2026-10-09T03:59:59.000Z', '2026-10-09T04:00:00.000Z', '2026-10-09T12:00:00.000Z', '2026-10-10T03:59:59.500Z', '2026-10-10T04:00:00.000Z']],
  ]
  const dayIn = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  for (const [label, truck, day, tz, kind, logs] of CASES) {
    kit.setNow(`${day}T12:00:00.000Z`)
    const counted = { now: [], utcLine: [] }
    for (const at of logs) {
      for (const [v, mod] of Object.entries(waMods)) {
        globalThis.__harnessDb = kit.fakeDb({ trucks: [truck], country_settings: [GB_SETTINGS_ROW, US_SETTINGS_ROW], orders: [], truck_events: [],
          whatsapp_logs: [{ id: 'w1', truck_id: truck.id, created_at: at, classification: 'SPECIFIC_QUERY', possible_miss: false }] })
        try {
          const res = await kit.quietAsync(() => mod.POST(new NextRequest('http://localhost/api/manage', { method: 'POST', body: JSON.stringify({ token: truck.dashboard_token, action: 'get_report', dateFrom: day, dateTo: day }) })))
          const body = await res.json()
          if (res.status !== 200) throw new Error(`get_report ${res.status} ${JSON.stringify(body).slice(0, 160)}`)
          if (body.report?.whatsappStats?.total === 1) counted[v].push(at)
        } finally { delete globalThis.__harnessDb }
      }
    }
    for (const at of logs) {
      const inNew = counted.now.includes(at), inOld = counted.utcLine.includes(at)
      const right = dayIn(at, tz) === day
      if (inNew !== right) fails.push(`WAS ${label}: a reply at ${at} is ${inNew ? '' : 'not '}counted on ${day} — its ${tz} day is ${dayIn(at, tz)}`)
      if (kind === 'us' || inNew === inOld) continue
      const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(at)))
      const bstMidnightHour = kind === 'bst' && londonHour === 0
      // the old upper bound '…T23:59:59' (UTC) left out 23:59:59.001–.999 UTC — in GMT, the London day's final second
      const finalSecond = kind === 'gmt' && /T23:59:59\.(?!000)\d{3}Z$/.test(at)
      if (!(bstMidnightHour || finalSecond)) fails.push(`WAS ${label}: a reply at ${at} moved (${inOld ? 'was' : 'was not'} counted) outside the allowed cases`)
    }
    const moved = logs.filter(at => counted.now.includes(at) !== counted.utcLine.includes(at))
    lines.push(`${label.padEnd(22)} ${counted.now.length}/${logs.length} replies counted on ${day}, each on its ${tz === LONDON ? 'London' : 'New York'} day${kind === 'us' ? '' : moved.length ? `; moved vs the UTC days: ${moved.join(', ')}` : '; identical to the UTC days'}`)
  }
  return { fails, lines }
}

module.exports = { MOMENTS, londonDays, kit, GB_TRUCK, GB_SETTINGS_ROW, US_SETTINGS_ROW, GB_TS, helpersView, slotsView, ordersView, edgeView, eventsView, promptsView, emailsView, screensView, dashApiView, usView, cancelView, waStatsView, compare, ALLOWED, snapshot }

if (require.main === module) {
  ;(async () => {
    const snap = await snapshot()
    if (CAPTURE) { fs.writeFileSync(path.resolve(CAPTURE), JSON.stringify(snap, null, 1)); console.log(`captured → ${CAPTURE}`); return }
    const fails = []
    // 1 · GB, byte for byte against the BEFORE snapshot, except the named allowances
    const before = JSON.parse(read(BEFORE_FILE))
    const c = compare(before, JSON.parse(JSON.stringify(snap)))
    fails.push(...c.fails)
    console.log(`GB: ${c.total} leaves at 4 instants compared with the BEFORE snapshot (${BEFORE_FILE})`)
    for (const r of ALLOWED) console.log(`  allowed ${r.id.padEnd(3)} ${String((c.allowed[r.id] || []).length).padStart(2)} leaf/leaves — ${r.site}${(c.allowed[r.id] || []).length ? '\n            ' + c.allowed[r.id].join('\n            ') : ''}`)
    // 2 · B1 — the dashboard API's "now": identical in GMT; in BST only `is_past` moves, and to London's clock
    const B1_MOMENTS = ['bstAfternoon', 'late2330', 'after0030'] // every instant in BST
    const b1 = []
    for (const [mk, iso] of Object.entries(MOMENTS)) {
      kit.setNow(iso)
      const D = londonDays(iso)
      const r = await dashApiView(D)
      if (!r['withStart|now'].startsWith('200 12:00')) fails.push(`${mk} B1: the with-start fixture returned no slots (${r['withStart|now'].slice(0, 80)}) — the proof would be empty`)
      if (r['noStart|now'] !== '200 ' || r['noStart|utcLine'] !== '200 ') fails.push(`${mk} B1: an event with no start time has slots (${r['noStart|now'].slice(0, 80)})`)
      if (r['withStart|now'] === r['withStart|utcLine']) { b1.push(`${mk}: identical`); continue }
      if (!B1_MOMENTS.includes(mk)) { fails.push(`${mk} B1: the dashboard API moved outside BST\n     now ${r['withStart|now'].slice(0, 300)}\n     utc ${r['withStart|utcLine'].slice(0, 300)}`); continue }
      // A past slot is also unavailable ("full" here), so `available` may move WITH `is_past` — never alone.
      const parse = x => x.slice(4).split(', ').map(t => ({ t: t.split(' ')[0], past: / past/.test(t), full: / full/.test(t) }))
      const N = parse(r['withStart|now']), U = parse(r['withStart|utcLine'])
      if (N.length !== U.length || N.some((x, i) => x.t !== U[i].t || (x.past === U[i].past && x.full !== U[i].full))) { fails.push(`${mk} B1: something other than is_past moved`); continue }
      const nowLondon = (() => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)); return Number(p.find(x => x.type === 'hour').value) * 60 + Number(p.find(x => x.type === 'minute').value) })()
      const wrong = r['withStart|now'].slice(4).split(', ').filter(x => { const [h, m] = x.split(' ')[0].split(':').map(Number); return (h * 60 + m < nowLondon) !== / past/.test(x) })
      if (wrong.length) { fails.push(`${mk} B1: is_past is not London's clock for ${wrong.slice(0, 5).join(', ')}`); continue }
      const moved = r['withStart|now'].slice(4).split(', ').filter((x, i) => x !== r['withStart|utcLine'].slice(4).split(', ')[i]).length
      b1.push(`${mk}: is_past corrected to London's clock on ${moved} slot(s) (it was UTC's)`)
    }
    console.log(`  allowed B1  the dashboard API's "now" (app/api/dashboard/route.ts) — BST only, is_past only:\n            ${b1.join('\n            ')}`)
    // 2b · the two §7 fixes — each an allowed UK difference for BST only (plus WAS's final second), checked
    const cxl = await cancelView()
    fails.push(...cxl.fails)
    console.log(`  allowed CXL the customer cancellation cutoff (app/api/orders/cancel) — BST only, to the true cutoff:\n            ${cxl.lines.join('\n            ')}`)
    const was = await waStatsView()
    fails.push(...was.fails)
    console.log(`  allowed WAS Reports' WhatsApp stats days (app/api/manage get_report) — BST 00:00–01:00, and a day's final second:\n            ${was.lines.join('\n            ')}`)
    // 3 · US
    const us = await usView()
    fails.push(...us.fails)
    console.log(`US: New York and Los Angeles at 20:00 local (Saturday in UTC), and a US truck with no timezone — ${us.fails.length ? 'FAILED' : 'every decision equals the GB truck\'s at 20:00 London; display in the US settings'}`)
    for (const [k, d] of Object.entries(us.proof)) console.log(`  ${k.padEnd(6)} ${d.time} · ${d.range} · ${d.numeric} · ${d.short} · ${d.labelToday} · week ${d.week.start}..${d.week.end} · ${d.events.find(e => e.startsWith('2026-10-09'))} · ${d.email.trim()} · ${d.ticket}`)
    if (fails.length) { console.error(`\n🔴 ${fails.length} failure(s):\n` + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1) }
    console.log('\n✅ time-dates-parity: GB identical outside the named windows; US correct')
  })().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
}
