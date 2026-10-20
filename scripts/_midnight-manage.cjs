// scripts/_midnight-manage.cjs — EVENTS THAT RUN PAST MIDNIGHT, area "manage" (scripts/midnight-events.cjs; the rule is
// lib/event-window.ts). A MODULE. Fixtures only: Pizza Kitchen ('test-truck'), GB (Europe/London) and US (New York).
//
// What it captures, from the REAL code (BEFORE 692adb4 and this tree):
//   • Manage › Schedule (app/manage/[token]/page.tsx): which list each event sits in (Upcoming section vs Past), the
//     Past order, EventStatusBadge, the pending-approval count ScheduleTab reports (its effect, run inline);
//   • the event editor: the END options offered for a start, the end-vs-start predicate, applyStartTimeChange, and the
//     "Ends the next day" hint under End time;
//   • lib/event-conflicts.ts detectEventConflicts; lib/schedule-extract.ts keeping an overnight end (a canned model
//     answer — nothing leaves the machine); app/api/manage GET's upcoming events (fake database) and upsert_event's
//     slot_capacity rows;
//   • 'fix|…import…' — Manage › Schedule › Import review, painted in WebKit with the compiled app CSS (.next of the main
//     checkout — never built here) and MEASURED: each time select's visible text vs its value, and sideways scroll.
// 🔴 'normal|' views must be byte-identical to BEFORE. 'fix|' views are NAMED changes (not compared): the editor's END
//    options for a normal start (an end before the start is now offered — it is an overnight event) and the import
//    review measurements.
const fs = require('fs'); const path = require('path'); const http = require('http'); const { execFileSync } = require('child_process')

const M_FILE = 'app/manage/[token]/page.tsx'
const ET_FILE = 'components/manage/EventTypes.tsx'
const SCHED_STATES = ['events', 'loadingEvents', 'vans', 'placeTypeChoices', 'editingEvent', 'showImportModal', 'importModalTitle', 'extractedEvents',
  'editedEvents', 'expandedEventIds', 'eventTypeId', 'addMode', 'showPast', 'formErrors']
const SIZES = [390, 800, 810, 1180, 1280]

async function views({ kit, REPO, FIX }) {
  const out = {}
  const safe = async (k, fn) => { try { out[k] = await fn() } catch (e) { out[k] = 'ERROR ' + String(e && e.stack || e).slice(0, 400) } }
  const L = require(path.join(REPO, 'scripts/_lp1d2-fixtures.cjs'))
  const ctx = L.context(kit, REPO)
  const { h } = ctx
  const has = re => re.test(ctx.src(M_FILE))
  const C = cc => {
    const base = cc === 'US' ? ctx.US : ctx.GB
    const time = FIX.time(cc)
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the shared fixture truck's plan is 'max', which the
    // Stage A catalogue no longer has — it resolves to the expiry fallback (payg), and since Stage A2 WITH payg's switches
    // (schedule_graphics off), which drops the event rows' "Make post" shortcut. In a tree with the plans migration the
    // truck holds the plan that stands in for Max (max → unlimited, as the API fixture below); BEFORE keeps 'max'.
    const plan = fs.existsSync(path.join(REPO, 'supabase/migrations/20261024_plans.sql')) ? 'unlimited' : base.truck.plan
    return { ...base, time, truck: { ...base.truck, plan, timezone: time.timeZone, time } }
  }
  const at = (cc, ymd, hhmm) => { kit.setNow(FIX.utcOf(cc, ymd, hhmm)); kit.setDeviceTz(FIX.COUNTRIES[cc].tz); kit.setDeviceLocale(FIX.COUNTRIES[cc].locale) }

  // ── THE MANAGE PAGE BUNDLE ──────────────────────────────────────────────────────────────────────────────────
  // The end-vs-start predicate is endEqualsStart on this tree, endIsNotAfterStart at BEFORE; the pending-count effect is
  // run inline (static rendering runs no effects) so the count ScheduleTab reports is captured.
  const pred = has(/function endEqualsStart\(/) ? 'endEqualsStart' : 'endIsNotAfterStart'
  let M = null
  await safe('_bundle', async () => {
    M = await kit.bundle('midnight-manage-page', [`export { ScheduleTab, EventTimeSelect, EventStatusBadge, applyStartTimeChange, __endPred } from '@/${M_FILE}'`, ctx.PROVIDERS].join('\n'), {
      patches: [
        { file: M_FILE, append: `export { ScheduleTab, EventTimeSelect, EventStatusBadge, applyStartTimeChange, ${pred} as __endPred }` },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
        { file: M_FILE, from: /useEffect\(\(\) => \{\n(\s+)if \(!onPendingCount \|\| loadingEvents\) return/, to: ';(() => {\n$1if (!onPendingCount || loadingEvents) return' },
        { file: M_FILE, from: /onPendingCount\(n\)\n(\s+)\}, \[events, loadingEvents, onPendingCount, tz\]\)/, to: 'onPendingCount(n)\n$1})()' },
        { file: M_FILE, states: ctx.states(M_FILE, SCHED_STATES) },
        { file: ET_FILE, states: ctx.states(ET_FILE, ['types', 'ready', 'usual']) },
      ],
    })
    return 'ok'
  })
  delete out._bundle
  if (!M) { out['normal|GB|any|bundle'] = 'ERROR the Manage page did not bundle'; return out }

  const noop = () => {}
  const api = async () => ({})
  const PRIVATE_TYPE = { id: 'type-private', name: 'Private', kind: 'private', upcoming: 0 }
  const sProps = (X, extra = {}) => ({ isActive: true, section: 'events', onSectionChange: noop, onOpenSocial: noop, truck: X.truck, token: 'harness', bundles: [], categories: [],
    notices: null, api, showToast: noop, onTruckUpdate: noop, onVerifySuccess: noop, onSwitchTab: noop, pendingVerifyEvents: null, onClearPendingVerify: noop,
    onPendingCount: noop, onEventsSaved: noop, ...extra })
  const sBase = { loadingEvents: false, vans: [], placeTypeChoices: [PRIVATE_TYPE], types: [PRIVATE_TYPE], ready: true, usual: null, showPast: true }
  const ev = (id, times, extra) => FIX.eventRow(id, times, { source: 'manual', is_private: false, private_name: null, event_deals: [], venue_match_confidence: 'high', ...extra })

  // ── 1 · THE SCHEDULE LIST: section, badge, past order, pending count ─────────────────────────────────────────
  // Which section each venue sits under: the last section heading before its card's venue line (Upcoming lists) or
  // "past" after the ▶. (The card's own venue line — an approval card's conflict panel names the other event too.)
  const card = v => `<p class="text-sm font-bold text-slate-900">${v}</p>`
  const placement = (html, venues) => {
    const pastAt = html.indexOf('▶')
    const heads = [...html.matchAll(/<p class="text-xs font-bold text-slate-[45]00 uppercase tracking-(?:wide|widest)">([^<]*)<\/p>/g)].map(m => ({ i: m.index, t: m[1] }))
    const o = {}
    for (const v of venues) {
      const i = html.indexOf(card(v))
      if (i < 0) { o[v] = 'absent'; continue }
      if (pastAt >= 0 && i > pastAt) { o[v] = 'past'; continue }
      const hd = heads.filter(x => x.i < i).pop()
      o[v] = hd ? hd.t : 'upcoming'
    }
    return o
  }
  const pastOrder = (html, venues) => {
    const pastAt = html.indexOf('▶'); if (pastAt < 0) return []
    return venues.map(v => [v, html.indexOf(card(v), pastAt)]).filter(([, i]) => i > 0).sort((a, b) => a[1] - b[1]).map(([v]) => v)
  }
  const badge = (X, e) => kit.textOf(ctx.html({}, ctx.inManage(M, X, h(M.EventStatusBadge, { status: e.status, event_date: e.event_date, start_time: e.start_time, end_time: e.end_time })))).text
  const scheduleViews = (kind, cc, label, events) => safe(`${kind}|${cc}|${label}|schedule`, () => {
    const X = C(cc)
    let pending = null
    const html = ctx.html({ ...sBase, events }, ctx.inManage(M, X, h(M.ScheduleTab, sProps(X, { onPendingCount: n => { pending = n } }))))
    if (typeof html !== 'string' || html.startsWith('ERROR')) return html
    const venues = events.map(e => e.venue_name)
    return { placement: placement(html, venues), pastOrder: pastOrder(html, venues), badges: Object.fromEntries(events.map(e => [e.venue_name, badge(X, e)])), pendingCount: pending }
  })

  for (const cc of ['GB', 'US']) {
    const normalEvents = [ev('n-conf', FIX.NORMAL, { venue_name: 'Market Square' }), ev('n-pend', FIX.NORMAL, { venue_name: 'Riverside Brewery', status: 'unconfirmed', source: 'scraper' })]
    for (const [label, ymd, hhmm] of FIX.NORMAL_MOMENTS) { at(cc, ymd, hhmm); await scheduleViews('normal', cc, label, normalEvents) }
    // The midnight event, a pending overnight one, and an earlier event the same evening (for the Past order).
    const midEvents = [ev('m-conf', FIX.MIDNIGHT, { venue_name: 'Market Square' }), ev('m-pend', FIX.MIDNIGHT, { venue_name: 'Riverside Brewery', status: 'unconfirmed', source: 'scraper' }),
      ev('m-early', { start_time: '18:00:00', end_time: '19:30:00' }, { venue_name: 'Village Hall' })]
    for (const [label, ymd, hhmm] of FIX.MIDNIGHT_MOMENTS) { at(cc, ymd, hhmm); await scheduleViews('midnight', cc, label, midEvents) }
    // MIDNIGHT FOLLOW-UPS (17 October 2026) — decision 2: a NORMAL 18:00–23:30 event whose finish was changed to 00:30 in the
    // finish-time modal IS an overnight event (18:00–00:30); Manage keeps it under Upcoming until 00:30 the next day.
    const extEvents = [ev('x-conf', FIX.EXTENDED, { venue_name: 'Market Square' })]
    for (const [label, ymd, hhmm] of FIX.MIDNIGHT_MOMENTS) { at(cc, ymd, hhmm); await scheduleViews('extended', cc, label, extEvents) }
    // Decision 4: the cards that WAIT FOR A PERSON — "Needs your approval" (scraped) and "Needs confirmation" (operator-added) —
    // with normal times (must be byte-identical: the whole tab's markup) and overnight ones (must say "Ends the next day").
    at(cc, FIX.EVENT_DATE, '10:00')
    const waitNormal = [ev('w-np', FIX.NORMAL, { venue_name: 'Riverside Brewery', status: 'unconfirmed', source: 'scraper' }), ev('w-nc', FIX.NORMAL, { venue_name: 'Village Hall', status: 'unconfirmed' })]
    await safe(`normal|${cc}|any|waitingCards.html`, () => ctx.html({ ...sBase, events: waitNormal }, ctx.inManage(M, C(cc), h(M.ScheduleTab, sProps(C(cc))))))
    const waitNight = [ev('w-mp', FIX.MIDNIGHT, { venue_name: 'Riverside Brewery', status: 'unconfirmed', source: 'scraper' }), ev('w-mc', FIX.MIDNIGHT, { venue_name: 'Village Hall', status: 'unconfirmed' }),
      ev('w-mx', FIX.MIDNIGHT, { venue_name: 'Market Square' })]
    await safe(`midnight|${cc}|any|waitingCards.hint`, () => {
      const html = ctx.html({ ...sBase, events: waitNight }, ctx.inManage(M, C(cc), h(M.ScheduleTab, sProps(C(cc)))))
      if (typeof html !== 'string' || html.startsWith('ERROR')) return html
      const msgs = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
      return { hints: html.split('data-overnight-hint').length - 1, text: (msgs.manageScheduleEvent || {}).endsNextDay, mentions: kit.textOf(html).text.split((msgs.manageScheduleEvent || {}).endsNextDay || '§').length - 1 }
    })
  }

  // ── 2 · THE EDITOR ─────────────────────────────────────────────────────────────────────────────────────────────
  // The END options EventTimeSelect offers after a start: every hour, and each hour's minutes (rendered with that hour).
  const optionValues = html => [...html.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/g)].map(m => [...m[1].matchAll(/<option value="([^"]*)"/g)].map(x => x[1]))
  const endOptions = (X, start) => {
    const props = v => ({ value: v, onChange: noop, className: 'w-full', placeholder: '--', minExclusive: start, notSameAs: start, label: 'End time' })
    const hours = optionValues(kit.renderStatic(ctx.inManage(M, X, h(M.EventTimeSelect, props('')))))[0].filter(Boolean)
    const offered = []
    for (const hh of hours) for (const mm of optionValues(kit.renderStatic(ctx.inManage(M, X, h(M.EventTimeSelect, props(`${hh}:`)))))[1].filter(Boolean)) offered.push(`${hh}:${mm}`)
    const hourLabels = [...kit.renderStatic(ctx.inManage(M, X, h(M.EventTimeSelect, props('')))).split('</select>')[0].matchAll(/<option value="(\d\d)">([^<]*)</g)].map(m => m[2])
    return { count: offered.length, first: offered[0], last: offered[offered.length - 1], has0030: offered.includes('00:30'), has2000: offered.includes('20:00'),
      has2005: offered.includes('20:05'), has1955: offered.includes('19:55'), has2245: offered.includes('22:45'), has1130: offered.includes('11:30'), has1125: offered.includes('11:25'),
      hourLabels: hourLabels.slice(0, 3).concat(hourLabels.slice(-2)) }
  }
  const editorHtml = (X, start, end) => ctx.html({ ...sBase, events: [], addMode: 'manual', editingEvent: { id: 'ev-x', venue_name: 'Market Square', town: 'Springfield', postcode: 'CB1 1AA', address: '',
    event_date: FIX.EVENT_DATE, start_time: start, end_time: end, notes: '', truck_id: 'test-truck', van_id: null, is_private: false, private_name: '' } }, ctx.inManage(M, X, h(M.ScheduleTab, sProps(X))))
  const msgs = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
  const hintText = (msgs.manageScheduleEvent || {}).endsNextDay || 'Ends the next day'
  for (const cc of ['GB', 'US']) {
    const X = C(cc)
    at(cc, FIX.EVENT_DATE, '12:00')
    await safe(`midnight|${cc}|any|editor|endOptions@20:00`, () => endOptions(X, '20:00'))
    await safe(`fix|${cc}|any|editor|endOptions@11:30`, () => endOptions(X, '11:30'))          // NAMED CHANGE: earlier ends now offered
    await safe(`normal|${cc}|any|editor|startOptions`, () => { const v = optionValues(kit.renderStatic(ctx.inManage(M, X, h(M.EventTimeSelect, { value: '11:30', onChange: noop, className: 'w-full', placeholder: '--', label: 'Start time' })))); return v })
    await safe(`normal|${cc}|any|editor|endPredicate`, () => ({ '11:30-22:45': M.__endPred('11:30', '22:45'), '11:30-': M.__endPred('11:30', ''), '-22:45': M.__endPred('', '22:45') }))
    await safe(`midnight|${cc}|any|editor|endPredicate`, () => ({ '20:00-00:30': M.__endPred('20:00', '00:30'), '20:00-20:00': M.__endPred('20:00', '20:00'), '20:00:00-00:30:00': M.__endPred('20:00:00', '00:30:00') }))
    await safe(`normal|${cc}|any|editor|startChange`, () => ({
      '12:00 over 11:30-22:45': M.applyStartTimeChange('12:00', '22:45', '11:30'), '23:30 over 11:30-22:45': M.applyStartTimeChange('23:30', '22:45', '11:30'),
      '22:45 over 11:30-22:45': M.applyStartTimeChange('22:45', '22:45', '11:30'), '19:00 no end': M.applyStartTimeChange('19:00', ''), '21:30 no end': M.applyStartTimeChange('21:30', ''),
      '23:30 no end': M.applyStartTimeChange('23:30', ''), 'cleared': M.applyStartTimeChange('', '22:45', '11:30') }))
    await safe(`midnight|${cc}|any|editor|startChange`, () => ({
      '21:00 over 20:00-00:30': M.applyStartTimeChange('21:00', '00:30', '20:00'), '00:30 over 20:00-00:30': M.applyStartTimeChange('00:30', '00:30', '20:00'),
      '00:15 over 20:00-00:30': M.applyStartTimeChange('00:15', '00:30', '20:00') }))
    await safe(`normal|${cc}|any|editor|nextDayHint`, () => { const t = kit.textOf(editorHtml(X, '11:30', '22:45')).text; return { hint: t.includes(hintText), endTimeLabel: t.includes((msgs.manageScheduleEvent || {}).endTime || 'End time') } })
    await safe(`midnight|${cc}|any|editor|nextDayHint`, () => { const t = kit.textOf(editorHtml(X, '20:00', '00:30')).text; return { hint: t.includes(hintText), hintText } })
    await safe(`midnight|${cc}|any|editor|sameTimeHint`, () => { const t = kit.textOf(editorHtml(X, '20:00', '20:00')).text; return { hint: t.includes(hintText) } })
  }

  // ── 3 · detectEventConflicts (lib/event-conflicts.ts) ───────────────────────────────────────────────────────────
  const EC = await kit.bundle('midnight-manage-conflicts', "export { detectEventConflicts } from '@/lib/event-conflicts'")
  const cRow = (id, date, s, e, extra = {}) => ({ id, event_date: date, venue_name: id, postcode: `PC ${id}`, start_time: s, end_time: e, status: 'confirmed', van_id: null, ...extra })
  const pairs = (cand, list) => EC.detectEventConflicts(cand, list).map(c => `${c.kind}:${c.event.id}`)
  const D = FIX.EVENT_DATE, N = FIX.NEXT_DATE, P = '2026-09-29'
  for (const cc of ['GB', 'US']) {
    await safe(`normal|${cc}|any|conflicts`, () => {
      const cand = cRow('cand', D, '11:30:00', '22:45:00', { status: 'unconfirmed', postcode: 'CB1 1AA' })
      return {
        list: pairs(cand, [cRow('same-21-23', D, '21:00', '23:00'), cRow('same-08-11', D, '08:00', '11:00'), cRow('next-00-01', N, '00:00', '01:00'), cRow('prev-20-23', P, '20:00', '23:00'),
          cRow('samepc-diff', D, '09:00', '10:00', { postcode: 'cb1 1aa' }), cRow('samepc-same', D, '11:30', '22:45', { postcode: 'CB11AA' }), cRow('nextpc', N, '11:30', '22:45', { postcode: 'CB1 1AA' }),
          cRow('touching', D, '22:45', '23:30'), cRow('unconf', D, '12:00', '13:00', { status: 'unconfirmed' })]),
      }
    })
    await safe(`midnight|${cc}|any|conflicts`, () => {
      const cand = cRow('cand', D, '20:00:00', '00:30:00', { status: 'unconfirmed', postcode: 'CB1 1AA' })
      const fromNext = cRow('cand2', N, '00:00', '01:00', { status: 'unconfirmed' })
      return {
        overnightCandidate: pairs(cand, [cRow('same-21-23', D, '21:00', '23:00'), cRow('next-00-01', N, '00:00', '01:00'), cRow('next-0030-01', N, '00:30', '01:00'), cRow('next-01-02', N, '01:00', '02:00'),
          cRow('same-18-1959', D, '18:00', '19:59'), cRow('prev-20-0030', P, '20:00', '00:30'), cRow('nextpc-00-01', N, '00:10', '00:20', { postcode: 'CB1 1AA' }), cRow('samepc', D, '20:00', '00:30', { postcode: 'CB1 1AA' })]),
        nextDayCandidate: pairs(fromNext, [cRow('prev-overnight', D, '20:00', '00:30'), cRow('prev-normal', D, '20:00', '23:59'), cRow('same-0030-02', N, '00:30', '02:00')]),
      }
    })
  }

  // ── 4 · lib/schedule-extract.ts — the model's end time kept for an overnight event ─────────────────────────────
  const SX = await kit.bundle('midnight-manage-extract', "export { extractScheduleEvents } from '@/lib/schedule-extract'")
  const extract = async (rows) => {
    const realFetch = globalThis.fetch, hadKey = process.env.GEMINI_API_KEY
    process.env.GEMINI_API_KEY = 'harness-no-network'
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(rows) }] } }] }), text: async () => '' })
    try { return (await kit.quietAsync(() => SX.extractScheduleEvents('schedule', FIX.time('GB')))).map(e => `${e.venue_name} ${e.start_time}–${e.end_time}`) }
    finally { globalThis.fetch = realFetch; if (hadKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = hadKey }
  }
  const xr = (v, s, e) => ({ event_date: '30/09/2026', venue_name: v, town: 'Springfield', postcode: 'CB1 1AA', start_time: s, end_time: e })
  for (const cc of ['GB', 'US']) {
    await safe(`normal|${cc}|any|scheduleExtract`, () => extract([xr('Normal', '11:30', '22:45'), xr('NoEnd', '17:00', ''), xr('Odd', 'noon', 'late')]))
    await safe(`midnight|${cc}|any|scheduleExtract`, () => extract([xr('Overnight', '20:00', '00:30'), xr('Same', '20:00', '20:00'), xr('SameSecs', '20:00', '20:00:00')]))
  }

  // ── 5 · app/api/manage — GET's upcoming events; upsert_event's slot_capacity rows ───────────────────────────────
  await safe('_api', async () => {
    const { makeFakePg } = require(path.join(REPO, 'scripts/_fake-pg.cjs'))
    const SEEDS = require(path.join(REPO, 'scripts/_country-settings-gb.cjs'))
    const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
    const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): GET /api/manage now loads the plan catalogue
    // (public.plans / public.plan_prices via lib/plans-server.ts getPlanCatalog) and answers 500 plans_failed without it.
    // The fake database carries the catalogue AS THE MIGRATION SEEDS IT (scripts/_plans-catalog-fixture.cjs), and the
    // truck's plan is a real catalogue key ('max' is gone; trucks.plan has an FK). BEFORE trees (no plans migration) keep
    // the old fixture exactly, so a recapture is unchanged. The events the GET returns are the same either way.
    const CATALOG = fs.existsSync(path.join(REPO, 'scripts/_plans-catalog-fixture.cjs')) ? require(path.join(REPO, 'scripts/_plans-catalog-fixture.cjs')).seedCatalog(REPO) : null
    const HAS_PLANS_SERVER = fs.existsSync(path.join(REPO, 'lib/plans-server.ts'))
    const API = await kit.bundle('midnight-manage-api', "export { POST as managePOST, GET as manageGET } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'" + (HAS_PLANS_SERVER ? "\nexport { clearPlanCatalogCache } from '@/lib/plans-server'" : ''), {
      stubs: {
        '@/lib/supabase/server': 'export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) } } }',
        '@/lib/email': 'export const sendEventCancellationEmail = async () => {}\nexport const sendConfirmationEmail = async () => {}',
      },
    })
    const T = (cc, events) => ({
      country_settings: [snake(SEEDS.gbFromSeed()), snake(ctx.US.settings)],
      // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): + public.plan_features (the loader reads all three).
      ...(CATALOG ? { plans: CATALOG.plans.map(snake), plan_prices: CATALOG.prices.map(snake), plan_features: (CATALOG.features || []).map(snake) } : {}),
      trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', dashboard_token: 'tok', operator_id: 'op-1', country: cc, timezone: FIX.COUNTRIES[cc].tz,
        plan: CATALOG ? 'unlimited' : 'max', feature_overrides: {}, trial_expires_at: null, setup_step: null, takes_cash: true, currency: FIX.COUNTRIES[cc].currency, default_auto_open: true, default_auto_close: true }],
      operators: [{ id: 'op-1', auth_user_id: 'u-1', is_admin: false }], truck_users: [],
      menu_categories: [], menu_items_db: [], menu_subcategories: [], modifier_groups: [], modifier_options: [], item_modifier_groups: [], category_modifier_groups: [],
      bundles_db: [], discount_codes_db: [], upsell_rules: [], truck_events: events,
      truck_vans: [{ id: 'v1', truck_id: 'test-truck', name: 'Van 1', is_active: true, kitchen_capacity: 4 }], slot_capacity: [], orders: [], production_slot_usage: [],
      sg_places: [], truck_places: [], event_types: [],
    })
    const run = async (cc, events, fn) => {
      const db = makeFakePg(T(cc, events), { keys: { slot_capacity: [['truck_id', 'event_date', 'slot']] } })
      globalThis.__harnessDb = { ...db, auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) } }
      API.clearCountrySettingsCache?.(); API.clearPlanCatalogCache?.()
      try { const res = await kit.quietAsync(fn); return { status: res.status, body: JSON.parse(await res.text()), writes: db.writes } }
      finally { delete globalThis.__harnessDb }
    }
    const req = (url, body) => new NextRequest(`http://127.0.0.1${url}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' })
    const getIds = async (cc, events) => { const r = await run(cc, events, () => API.manageGET(req('/api/manage?token=tok'))); return r.status === 200 ? (r.body.events || []).map(e => e.id) : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}` }
    const slotsOf = async (cc, times) => {
      const r = await run(cc, [], () => API.managePOST(req('/api/manage', { action: 'upsert_event', token: 'tok', venue_name: 'Market Square', town: 'Springfield', postcode: 'CB1 1AA', address: '',
        event_date: FIX.EVENT_DATE, ...times, notes: '', van_id: 'v1' })))
      const sc = r.writes.filter(w => w.table === 'slot_capacity' && w.row).map(w => w.row)
      const slots = sc.map(x => x.slot)
      return { status: r.status, error: r.status === 200 ? null : JSON.stringify(r.body).slice(0, 200), count: slots.length, first: slots[0] ?? null, last: slots[slots.length - 1] ?? null,
        dates: [...new Set(sc.map(x => x.event_date))], has0015: slots.includes('00:15'), has2355: slots.includes('23:55') }
    }
    const prevDay = '2026-09-29'
    for (const cc of ['GB', 'US']) {
      const nEvents = [ev('n-yday', FIX.NORMAL, { event_date: prevDay }), ev('n-today', FIX.NORMAL), ev('n-next', FIX.NORMAL, { event_date: FIX.NEXT_DATE })]
      for (const [label, ymd, hhmm] of FIX.NORMAL_MOMENTS) { at(cc, ymd, hhmm); await safe(`normal|${cc}|${label}|manageGET.events`, () => getIds(cc, nEvents)) }
      const mEvents = [ev('m-yday', FIX.MIDNIGHT, { event_date: prevDay }), ev('m-night', FIX.MIDNIGHT), ev('n-yday', FIX.NORMAL, { event_date: prevDay }), ev('n-today', FIX.NORMAL)]
      for (const [label, ymd, hhmm] of FIX.MIDNIGHT_MOMENTS) { at(cc, ymd, hhmm); await safe(`midnight|${cc}|${label}|manageGET.events`, () => getIds(cc, mEvents)) }
      at(cc, FIX.EVENT_DATE, '12:00')
      await safe(`normal|${cc}|any|upsertEvent.slotCapacity`, () => slotsOf(cc, { start_time: '11:30', end_time: '22:45' }))
      await safe(`midnight|${cc}|any|upsertEvent.slotCapacity`, () => slotsOf(cc, { start_time: '20:00', end_time: '00:30' }))
    }
    return 'ok'
  })
  if (out._api === 'ok') delete out._api
  else { out['midnight|GB|any|api'] = out._api; delete out._api }

  // ── 6 · IMPORT REVIEW, PAINTED AND MEASURED (fix|) ──────────────────────────────────────────────────────────────
  await importViews({ kit, REPO, FIX, ctx, M, C, at, sProps, sBase, out, safe, ev })
  return out
}

// The main checkout (where .next lives) — this tree, or, from BEFORE's worktree, the checkout it was added from.
function mainCheckout(REPO) {
  try { return path.dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim()) } catch { return REPO }
}

async function importViews({ kit, REPO, FIX, ctx, M, C, at, sProps, sBase, out, safe, ev }) {
  const { h } = ctx
  const MAIN = mainCheckout(REPO)
  const STATIC = path.join(MAIN, '.next/static')
  if (!fs.existsSync(STATIC)) { out['fix|GB|any|import'] = 'ERROR no .next/static in the main checkout'; return }
  const cssFiles = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.css')) cssFiles.push(f) } }
  walk(STATIC); cssFiles.sort()
  const css = cssFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  const sans = (css.match(/\.(geist_[0-9a-f]+-module__[A-Za-z0-9_-]+__variable)\b/) || [])[1] || ''
  const fonts = `${sans} antialiased`
  const VANS = [{ id: 'v1', name: 'Van 1' }, { id: 'v2', name: 'Big van' }]
  const place = cc => (cc === 'US' ? { town: 'Springfield', postcode: '62701' } : { town: 'Harnessville', postcode: 'CB8 8XX' })
  const IMPORT = cc => [
    { id: 'x1', event_date: '30/09/2026', venue_name: 'Market Square', ...place(cc), start_time: '11:30', end_time: '22:45', selected: true, van_id: 'v2' },
    { id: 'x2', event_date: '02/10/2026', venue_name: 'The Old Crown', ...place(cc), start_time: '20:00', end_time: '00:30', selected: true, van_id: 'v1' },
    { id: 'x3', event_date: '03/10/2026', venue_name: 'Village Hall', ...place(cc), start_time: '12:45', end_time: '22:45', selected: true },
  ]
  const bodies = {}
  for (const cc of ['GB', 'US']) {
    const X = C(cc)
    at(cc, FIX.EVENT_DATE, '10:00')
    bodies[cc] = ctx.html({ ...sBase, events: [], vans: VANS, showImportModal: true, importModalTitle: 'found', extractedEvents: IMPORT(cc), editedEvents: IMPORT(cc),
      expandedEventIds: new Set(['x1', 'x2', 'x3']) }, ctx.inManage(M, X, h(M.ScheduleTab, sProps(X))))
    if (typeof bodies[cc] !== 'string' || bodies[cc].startsWith('ERROR')) { out[`fix|${cc}|any|import`] = String(bodies[cc]).slice(0, 300); delete bodies[cc] }
    // The overnight row's "Ends the next day" hint, as rendered (not measured).
    else {
      const msgs = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
      const hint = (msgs.manageScheduleEvent || {}).endsNextDay || 'Ends the next day'
      out[`midnight|${cc}|any|import.nextDayHint`] = { count: kit.textOf(bodies[cc]).text.split(hint).length - 1, hint }
    }
  }
  // MIDNIGHT FOLLOW-UPS — decision 4: the waiting cards with overnight times, painted at 390 / 800 / 1280 (fu|).
  const cardBodies = {}
  for (const cc of ['GB', 'US']) {
    at(cc, FIX.EVENT_DATE, '10:00')
    const waitNight = [ev('w-mp', FIX.MIDNIGHT, { venue_name: 'Riverside Brewery', status: 'unconfirmed', source: 'scraper' }), ev('w-mc', FIX.MIDNIGHT, { venue_name: 'Village Hall', status: 'unconfirmed' })]
    const b = ctx.html({ ...sBase, events: waitNight }, ctx.inManage(M, C(cc), h(M.ScheduleTab, sProps(C(cc)))))
    if (typeof b === 'string' && !b.startsWith('ERROR')) cardBodies[cc] = b
  }
  let current = ''
  const types = { '.css': 'text/css', '.woff2': 'font/woff2' }
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (u === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(current) }
    const f = path.join(STATIC, u.replace(/^\/_next\/static\//, ''))
    if (!u.startsWith('/_next/static/') || !f.startsWith(STATIC) || !fs.existsSync(f)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
  })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${srv.address().port}/`
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  try {
    for (const cc of Object.keys(bodies)) {
      const context = await browser.newContext({ locale: FIX.COUNTRIES[cc].locale, timezoneId: FIX.COUNTRIES[cc].tz, deviceScaleFactor: 1 })
      const page = await context.newPage()
      current = `<!doctype html><html lang="${FIX.COUNTRIES[cc].locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>html,body{margin:0}</style></head>` +
        `<body class="${fonts} bg-slate-50"><main class="w-full pb-6 px-4"><div class="manage-tab-pad pt-6">${bodies[cc]}</div></main></body></html>`
      await page.setViewportSize({ width: SIZES[0], height: 900 })
      await page.goto(url, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts && document.fonts.ready)
      for (const w of SIZES) {
        await page.setViewportSize({ width: w, height: 900 })
        await page.waitForTimeout(50)
        await safe(`fix|${cc}|any|import|${w}`, () => page.evaluate(MEASURE))
        // HG_MIDNIGHT_SHOTS=<dir>: also save what was measured, for a human look (never part of a view).
        if (process.env.HG_MIDNIGHT_SHOTS) await page.screenshot({ path: path.join(process.env.HG_MIDNIGHT_SHOTS, `import-${cc}-${w}.png`), fullPage: false })
      }
      // Decision 4's cards, the same way: each hint visible, inside the page, and no sideways scroll.
      if (cardBodies[cc]) {
        current = current.replace(/<div class="manage-tab-pad pt-6">[\s\S]*<\/div><\/main>/, `<div class="manage-tab-pad pt-6">${cardBodies[cc]}</div></main>`)
        await page.goto(url, { waitUntil: 'load' })
        await page.evaluate(() => document.fonts && document.fonts.ready)
        for (const w of [390, 800, 1280]) {
          await page.setViewportSize({ width: w, height: 900 })
          await page.waitForTimeout(50)
          await safe(`fu|${cc}|any|waitingCards|${w}`, () => page.evaluate(() => {
            const hints = [...document.querySelectorAll('[data-overnight-hint]')].map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), visible: r.width > 0 && r.height > 0 } })
            return { hints, innerWidth, scrollX: document.documentElement.scrollWidth - innerWidth }
          }))
          if (process.env.HG_MIDNIGHT_SHOTS) await page.screenshot({ path: path.join(process.env.HG_MIDNIGHT_SHOTS, `waiting-${cc}-${w}.png`), fullPage: false })
        }
      }
      await context.close()
    }
  } finally { await browser.close(); srv.close() }
}

// In WebKit: every visible time select in the import modal — its selected text's width vs the room inside its padding —
// and how far the desktop table / the modal scroll sideways.
function MEASURE() {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' }
  const canvas = document.createElement('canvas').getContext('2d')
  const textW = (el, s) => { const cs = getComputedStyle(el); canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return canvas.measureText(s).width }
  const modal = [...document.querySelectorAll('.fixed')].find(vis)
  const inner = modal ? modal.firstElementChild : document.body
  const table = inner.querySelector('table')
  const tableShown = !!table && vis(table)
  // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-5a-phone-time-select: below 640px each time is ONE select inside
  // [data-phone-time] (aria-label = the field's label, "Start time" / "End time"); the hour + minute pair is max-sm:hidden.
  // Both kinds are measured; `phone` says which.
  const sel = [...inner.querySelectorAll('select')].filter(s => vis(s) && (/hour|minute/i.test(s.getAttribute('aria-label') || '') || !!s.closest('[data-phone-time]')))
  const selects = sel.map(s => {
    const cs = getComputedStyle(s)
    const label = s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''
    const avail = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const need = textW(s, label)
    return { aria: s.getAttribute('aria-label'), phone: !!s.closest('[data-phone-time]'), label, width: Math.round(s.getBoundingClientRect().width), avail: Math.round(avail), need: Math.round(need), cut: Math.max(0, Math.round(need - avail)), fontSize: cs.fontSize }
  })
  return {
    vw: window.innerWidth, layout: tableShown ? 'table' : 'cards', selects,
    selectsCut: selects.filter(s => s.cut > 0).length, emptyBoxes: selects.filter(s => s.avail <= 0).length,
    tableOver: tableShown ? table.parentElement.scrollWidth - table.parentElement.clientWidth : null,
    columns: tableShown ? [...table.querySelector('tbody tr').children].map(td => Math.round(td.getBoundingClientRect().width)) : null,
    modalScrollX: inner.scrollWidth - inner.clientWidth, pageScrollX: document.documentElement.scrollWidth - window.innerWidth,
  }
}

// ── CHECKS (A = this tree, B = BEFORE) ─────────────────────────────────────────────────────────────────────────────
function checks(t, A, B) {
  const msgs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'messages/en-GB.json'), 'utf8'))
  const hint = (msgs.manageScheduleEvent || {}).endsNextDay
  t('manage: the "Ends the next day" message exists (manageScheduleEvent.endsNextDay)', typeof hint === 'string' && hint.length > 0, hint)
  // Where the midnight event must sit at each moment: Upcoming (its confirmed section) until 00:30 the next day, then Past.
  const expectUpcoming = { '19:00': true, '23:50': true, '00:15': true, '00:31': false, 'next-afternoon': false }
  // ── MIDNIGHT FOLLOW-UPS ──
  for (const cc of ['GB', 'US']) {
    // Decision 2: the 18:00–23:30 event extended to 00:30 in the finish-time modal stays under Upcoming until 00:30.
    for (const [m, up] of Object.entries(expectUpcoming)) {
      const v = A[`extended|${cc}|${m}|schedule`]
      const conf = v && v.placement ? v.placement['Market Square'] : v
      t(`manage ${cc} ${m}: the event extended to 00:30 is under ${up ? 'Upcoming' : 'Past'} (${conf})`, !!v && v.placement && (up ? conf !== 'past' && conf !== 'absent' : conf === 'past'), v)
    }
    // Decision 4: a waiting overnight event says so on its card; the confirmed one does not.
    const wh = A[`midnight|${cc}|any|waitingCards.hint`]
    t(`manage ${cc}: "Ends the next day" on the "Needs your approval" AND "Needs confirmation" cards, not on the confirmed one (${wh && wh.hints} hints)`,
      !!wh && wh.hints === 2 && wh.mentions === 2, wh)
    for (const w of [390, 800, 1280]) {
      const p = A[`fu|${cc}|any|waitingCards|${w}`]
      t(`manage ${cc} ${w}: both hints are visible, inside the page, and nothing scrolls sideways`,
        !!p && Array.isArray(p.hints) && p.hints.length === 2 && p.hints.every(x => x.visible && x.right <= p.innerWidth) && p.scrollX === 0, p)
    }
    // ⚠️ RE-PINNED, 18 October 2026: byte-identical to BEFORE + the named US-layout changes (`named` below: fix 3's phone
    // grid classes; fix 1's U+00A0 on US) — and those changes must actually apply.
    const wk = `normal|${cc}|any|waitingCards.html`
    t(`manage ${cc}: the waiting cards with normal times are byte-identical to BEFORE + us-layout-fix-3-schedule-phone-cards${cc === 'US' ? ' + us-layout-fix-1-nbsp' : ''} + pending-card-buttons (the whole tab's markup)`,
      typeof A[wk] === 'string' && named(wk, B[wk]) !== B[wk] && A[wk] === named(wk, B[wk]))
  }
  for (const cc of ['GB', 'US']) {
    for (const [m, up] of Object.entries(expectUpcoming)) {
      const v = A[`midnight|${cc}|${m}|schedule`]
      if (!v || typeof v === 'string') { t(`manage ${cc} ${m}: schedule rendered`, false, v); continue }
      const conf = v.placement['Market Square'], pend = v.placement['Riverside Brewery']
      t(`manage ${cc} ${m}: the 20:00–00:30 event is under ${up ? 'Upcoming' : 'Past'} (${conf})`, up ? conf !== 'past' && conf !== 'absent' : conf === 'past', v)
      t(`manage ${cc} ${m}: the pending overnight event is ${up ? 'in Needs approval' : 'Past'}`, up ? pend !== 'past' && pend !== 'absent' : pend === 'past', v.placement)
      t(`manage ${cc} ${m}: pending-approval count ${up ? 1 : 0}`, v.pendingCount === (up ? 1 : 0), v.pendingCount)
      const fin = (msgs.manageSchedule && msgs.manageSchedule.status && msgs.manageSchedule.status.finished) || 'Finished'
      t(`manage ${cc} ${m}: EventStatusBadge ${up ? 'not ' : ''}"${fin}"`, up ? v.badges['Market Square'] !== fin : v.badges['Market Square'] === fin, v.badges)
    }
    const na = A[`midnight|${cc}|next-afternoon|schedule`]
    t(`manage ${cc}: Past lists the overnight event (ends 00:30 the next day) before that evening's 18:00–19:30`, na && na.pastOrder && na.pastOrder.indexOf('Market Square') < na.pastOrder.indexOf('Village Hall') && na.pastOrder.indexOf('Market Square') >= 0, na && na.pastOrder)
    const b = B[`midnight|${cc}|00:15|schedule`]
    t(`manage ${cc} (contrast): BEFORE put the running overnight event under Past at 00:15`, b && b.placement && b.placement['Market Square'] === 'past', b && b.placement)

    const eo = A[`midnight|${cc}|any|editor|endOptions@20:00`]
    t(`manage ${cc}: editor end options for a 20:00 start offer 00:30 and 19:55, not 20:00`, eo && eo.has0030 && eo.has1955 && !eo.has2000 && eo.has2005, eo)
    const fo = A[`fix|${cc}|any|editor|endOptions@11:30`]
    t(`manage ${cc} (named change): a normal 11:30 start's end options now include earlier times (overnight) but not 11:30`, fo && fo.has1125 && !fo.has1130 && fo.has2245 && fo.count === 24 * 12 - 1, fo)
    const ep = A[`midnight|${cc}|any|editor|endPredicate`]
    t(`manage ${cc}: editor flags 20:00–20:00, accepts 20:00–00:30`, ep && ep['20:00-00:30'] === false && ep['20:00-20:00'] === true && ep['20:00:00-00:30:00'] === false, ep)
    const sc = A[`midnight|${cc}|any|editor|startChange`]
    t(`manage ${cc}: moving an overnight event's start keeps its end (unless equal)`, sc && sc['21:00 over 20:00-00:30'].end_time === '00:30' && sc['00:30 over 20:00-00:30'].end_time === '' && sc['00:15 over 20:00-00:30'].end_time === '00:30', sc)
    const hn = A[`midnight|${cc}|any|editor|nextDayHint`], hs = A[`midnight|${cc}|any|editor|sameTimeHint`], hN = A[`normal|${cc}|any|editor|nextDayHint`]
    t(`manage ${cc}: "Ends the next day" under End time for 20:00–00:30 only`, hn && hn.hint === true && hs && hs.hint === false && hN && hN.hint === false, { hn, hs, hN })
    const ih = A[`midnight|${cc}|any|import.nextDayHint`]
    t(`manage ${cc}: the import review says "Ends the next day" for its overnight row`, ih && ih.count >= 1, ih)

    const cf = A[`midnight|${cc}|any|conflicts`]
    const oc = cf && cf.overnightCandidate || []
    t(`manage ${cc}: an overnight event overlaps 21:00–23:00 that date and 00:00–01:00 the next`, oc.includes('overlap:same-21-23') && oc.includes('overlap:next-00-01') && oc.includes('overlap:next-0030-01') === false, oc)
    t(`manage ${cc}: …not 01:00–02:00 the next date, nor 18:00–19:59 before it`, !oc.some(x => /next-01-02|same-18-1959/.test(x)), oc)
    t(`manage ${cc}: …overlaps the previous night's overnight event? no (it ended 00:30 that morning)`, !oc.some(x => /prev-20-0030/.test(x)), oc)
    t(`manage ${cc}: …same postcode the next date is an overlap, not a "review"; same postcode same date is a duplicate`, oc.includes('overlap:nextpc-00-01') && oc.includes('duplicate:samepc'), oc)
    const nc = cf && cf.nextDayCandidate || []
    t(`manage ${cc}: a 00:00–01:00 event overlaps the previous night's 20:00–00:30 (and that day's 00:30–02:00), not a 20:00–23:59`, nc.includes('overlap:prev-overnight') && nc.includes('overlap:same-0030-02') && !nc.some(x => /prev-normal/.test(x)), nc)

    const sx = A[`midnight|${cc}|any|scheduleExtract`]
    t(`manage ${cc}: the schedule importer keeps 20:00–00:30 and blanks only an end equal to the start`, Array.isArray(sx) && sx.includes('Overnight 20:00–00:30') && sx.includes('Same 20:00–') && sx.includes('SameSecs 20:00–'), sx)

    const exp = { '19:00': ['m-night', 'n-today'], '23:50': ['m-night', 'n-today'], '00:15': ['m-night'], '00:31': [], 'next-afternoon': [] }
    for (const [m, ids] of Object.entries(exp)) {
      const g = A[`midnight|${cc}|${m}|manageGET.events`]
      t(`manage ${cc} ${m}: GET /api/manage's upcoming events = ${JSON.stringify(ids)}`, JSON.stringify(g) === JSON.stringify(ids), g)
    }
    const up = A[`midnight|${cc}|any|upsertEvent.slotCapacity`]
    t(`manage ${cc}: upsert_event writes slot_capacity through 00:30 (generateSlots, lib/slots.ts), on the event's date`, up && up.status === 200 && up.has2355 && up.has0015 && up.last === '00:30' && up.count === 55 && JSON.stringify(up.dates) === JSON.stringify(['2026-09-30']), up)

    // Import review — every time value fully visible, no sideways scroll, at every size.
    // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-5a-phone-time-select (EventTimeSelect). OLD at 390: "every hour/minute
    // value fully visible" over the hour + minute pair. NEW at 390 (below 640px): ONE select per time — the three rows'
    // six times, start then end — each showing the WHOLE time ("11:30" / "11:30 AM", U+00A0 before AM/PM), none cut, and no
    // hour or minute select visible. From 640px up: the hour + minute pair exactly as before (and no phone select).
    const WHOLE = cc === 'US' ? ['11:30 AM', '10:45 PM', '8:00 PM', '12:30 AM', '12:45 PM', '10:45 PM'].map(x => x.replace(' ', '\u00A0')) : ['11:30', '22:45', '20:00', '00:30', '12:45', '22:45']
    for (const w of SIZES) {
      const v = A[`fix|${cc}|any|import|${w}`]
      if (!v || typeof v === 'string') { t(`manage ${cc} import ${w}: measured`, false, v); continue }
      if (w < 640) {
        const ph = v.selects.filter(s => s.phone)
        t(`manage ${cc} import ${w} (us-layout-fix-5a-phone-time-select): one select per time, each whole time fully visible (${ph.length} phone selects, ${v.layout})`,
          ph.length === v.selects.length && JSON.stringify(ph.map(s => s.label)) === JSON.stringify(WHOLE) && JSON.stringify(ph.map(s => s.aria)) === JSON.stringify(['Start time', 'End time', 'Start time', 'End time', 'Start time', 'End time'])
            && v.selectsCut === 0 && v.emptyBoxes === 0, v.selects.map(s => [s.aria, s.label, s.phone, s.cut]))
      } else
        t(`manage ${cc} import ${w}: every hour/minute value fully visible (${v.selects.length} selects, ${v.layout})`, v.selects.length >= 12 && !v.selects.some(s => s.phone) && v.selectsCut === 0 && v.emptyBoxes === 0, v.selects.filter(s => s.cut > 0 || s.phone))
      t(`manage ${cc} import ${w}: nothing scrolls sideways (table ${v.tableOver}, modal ${v.modalScrollX})`, (v.tableOver == null || v.tableOver <= 0) && v.modalScrollX <= 0 && v.pageScrollX <= 0, v)
    }
  }
}

/* ══ NAMED (US layout fixes, 18 October 2026, /Users/dominicbonini/dev/usl-out/REPIN-BRIEF.md) ══════════════════════════════
 * The normal views equal BEFORE with exactly these applied (scripts/midnight-events.cjs `named(id, before, B)`):
 *  • us-layout-fix-5a-phone-time-select — normal|*|any|editor|startOptions (the select option VALUES EventTimeSelect renders
 *    for a start at 11:30): BEFORE's hour list and minute list unchanged, plus a THIRD select — the phone control — offering
 *    '' then every 5-minute time 00:00 … 23:55 (a start field: nothing excluded). Computed from the rule, not from AFTER.
 *  • us-layout-fix-3-schedule-phone-cards — normal|*|any|waitingCards.html (Manage › Schedule, the waiting cards): each card's
 *    row `flex items-start gap-4` gains `max-sm:grid max-sm:grid-cols-[3rem_1px_minmax(0,1fr)] max-sm:gap-x-4 max-sm:gap-y-2.5`;
 *    on a card WITH action icons ("Needs confirmation") the divider gains `max-sm:row-span-2` and the actions div gains
 *    `max-sm:col-start-3 max-sm:flex-wrap` + data-card-actions="true"; a "Needs your approval" card (no icon cluster) keeps
 *    BEFORE's divider. Exact substrings, one card at a time.
 *  • us-layout-fix-1-nbsp — the same US view: the card's time line ("11:30 AM–10:45 PM") carries U+00A0 before AM/PM.
 *  • ⚠️ RE-PINNED (pending-card buttons, 19 October 2026, docs/pending-card-buttons-report.md) — the same view: on each
 *    "Needs your approval" card the chips and the summary are wrapped in the chips row, which holds a COPY of the bottom
 *    row's own buttons markup (`max-sm:hidden`), the summary gains its `sm:` classes, the "why Approve is off" note is
 *    added beside it only where the bottom row has one, and the bottom row becomes `mt-3 sm:hidden`. Every piece found
 *    exactly once per card (the n-th chooser with the n-th bottom row), else BEFORE is returned (and the view fails). */
const ROW_OLD = '<div class="flex items-start gap-4">'
const ROW_NEW = '<div class="flex items-start gap-4 max-sm:grid max-sm:grid-cols-[3rem_1px_minmax(0,1fr)] max-sm:gap-x-4 max-sm:gap-y-2.5">'
const DIV_OLD = '<div class="w-px bg-slate-100 self-stretch flex-shrink-0"></div>'
const DIV_NEW = '<div class="w-px bg-slate-100 self-stretch flex-shrink-0 max-sm:row-span-2"></div>'
const ACT_OLD = '<div class="flex items-center gap-1.5 flex-shrink-0 self-start">'
const ACT_NEW = '<div class="flex items-center gap-1.5 flex-shrink-0 self-start max-sm:col-start-3 max-sm:flex-wrap" data-card-actions="true">'
const PCB_ROW_OLD = '<div class="mt-3" data-pending-actions="true">'
const PCB_ROW_NEW = '<div class="mt-3 sm:hidden" data-pending-actions="true">'
function pendingCardButtons(html) {
  const choosers = html.split('data-pending-type="true"').length - 1
  if (!choosers || html.split(PCB_ROW_OLD).length - 1 !== choosers) return null
  const rows = html.split(PCB_ROW_OLD)   // rows[n + 1] starts with card n's bottom row
  const out = [rows[0]]
  for (let n = 0; n < choosers; n++) {
    const bottom = rows[n + 1]
    const btn = /^<div class="flex gap-2 sm:justify-end">(?:(?!<\/div>)[\s\S])*<\/div>/.exec(bottom)
    if (!btn) return null
    const why = /^<p class="mt-1\.5 text-xs text-slate-500 sm:text-right" data-approve-reason="true">([^<]*)<\/p>/.exec(bottom.slice(btn[0].length))
    // this card's chooser is in the text BEFORE its bottom row: the last radiogroup + summary in out[n]
    const prev = out[n]
    const re = /(<div role="radiogroup"[^>]*>(?:(?!<\/div>)[\s\S])*<\/div>)<p class="mt-1 text-xs text-slate-500">([\s\S]*?)<\/p>/g
    const all = [...prev.matchAll(re)]
    if (!all.length) return null
    const m = all[all.length - 1]
    const note = why ? `<div class="sm:ml-auto sm:text-right"><p class="max-sm:hidden text-xs text-slate-500 text-right" data-approve-reason="true">${why[1]}</p></div>` : ''
    const row = '<div class="sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1" data-event-type-row="true">' + m[1]
      + `<div class="sm:ml-auto"><div class="max-sm:hidden" data-pending-actions-row="true">${btn[0]}</div></div>`
      + `<div class="sm:basis-full sm:flex sm:items-start sm:gap-x-3"><p class="mt-1 text-xs text-slate-500 sm:mt-0 sm:flex-1 sm:min-w-0">${m[2]}</p>${note}</div></div>`
    out[n] = prev.slice(0, m.index) + row + prev.slice(m.index + m[0].length)
    out.push(bottom)
  }
  return out.join(PCB_ROW_NEW)
}
function named(id, before) {
  if (/^normal\|(GB|US)\|any\|editor\|startOptions$/.test(id) && Array.isArray(before) && before.length === 2) {
    const all = []
    for (let m = 0; m < 1440; m += 5) all.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    return [...before, ['', ...all]]
  }
  const w = /^normal\|(GB|US)\|any\|waitingCards\.html$/.exec(id)
  if (w && typeof before === 'string') {
    const parts = before.split(ROW_OLD)
    if (parts.length < 2) return before
    const cards = parts.slice(1).map(c => {
      if (!c.includes(ACT_OLD)) return c   // no icon cluster: the divider stays as BEFORE
      if (c.split(DIV_OLD).length !== 2 || c.split(ACT_OLD).length !== 2) return null
      return c.replace(DIV_OLD, DIV_NEW).replace(ACT_OLD, ACT_NEW)
    })
    if (cards.includes(null)) return before
    let v = [parts[0], ...cards].join(ROW_NEW)
    if (w[1] === 'US') v = v.replace(/(<p class="text-sm font-semibold text-slate-700 mt-0\.5">)([^<]*)(<\/p>)/g, (m, a, x, b) => a + x.replace(/(\d{1,2}:\d{2}) (AM|PM)\b/g, '$1\u00A0$2') + b)
    return pendingCardButtons(v) ?? before
  }
  return before
}

module.exports = { views, checks, named }
