// scripts/_midnight-public.cjs — area "public" of scripts/midnight-events.cjs: the PUBLIC and customer-facing surfaces of
// an event that runs past midnight (docs/midnight-and-format-fixes-report.md), plus two US format bugs on the same cards.
// A MODULE. Every view runs the REAL module on fixtures (Pizza Kitchen, 'test-truck' / 'test-kitchen'; the in-memory
// database of scripts/_fake-pg.cjs; nothing live), on BOTH codes (BEFORE 692adb4 has no lib/event-window.ts).
//
//   feed-vf / feed-hg   /api/discovery/events on Village Foodie's host and HatchGrab's (scraped + operator legs)
//   embed               /api/embed/events (the custom-domain schedule's source) — its `events`
//   wa-upcoming / wa-prompt   lib/whatsapp/upcoming-events fetchUpcomingTruckEvents (10 later events too, so the limit
//                       shows) and the classifier's prompt line for the event (lib/whatsapp-classifier formatEventForPrompt)
//   wp-overview / wp-load     /api/weekly-post social_overview `upcoming` and event_load `nextEvents` (the single-event pickers)
//   home-all / home-today     the home page's list (app/page.tsx + the real hooks/useVillageData), device clock in the zone
//   cal-*               lib/utils getGoogleLink / getOutlookLink / downloadICS (the .ics text)
//   sched               supabase/functions/auto-event-scheduler: the handler run on the fake database — which rows it opens
//                       and closes (an auto_close copy, a manual copy, one two days older, an auto_open confirmed copy)
//   fmt|…               the US format views: TruckListCard on the public truck page (app/trucks/[slug]/page.tsx → TruckClient)
//                       and on the custom-domain schedule (EmbedSchedule fed by the embed route). GB is a NORMAL view
//                       (byte-identical); US is asserted (it changes on purpose: the truck's own 12-hour style).
//   midnight|…|-|sched-parity   this tree only: shouldAutoClose (the edge function's mirrored rule) against
//                       lib/event-window.ts over a grid of days × minutes.
const path = require('path')

const PAGE_STUBS = {
  'next/script': "import { createElement } from 'react'\nexport default function Script(p) { return createElement('script', { 'data-src': p.src || '' }) }",
  'next/dynamic': 'export default function dynamic() { return function Dynamic() { return null } }',
  'posthog-js/react': 'export const usePostHog = () => null\nexport function PostHogProvider(p) { return p.children }',
}
const WP_STUBS = {
  'next/og': 'export class ImageResponse { constructor() {} async arrayBuffer() { return new ArrayBuffer(0) } }',
  '@upstash/redis': 'export class Redis { static fromEnv() { return new Redis() } }',
  '@upstash/ratelimit': 'export class Ratelimit { static slidingWindow() { return {} } static fixedWindow() { return {} } async limit() { return { success: true } } }',
}

async function views({ kit, REPO, FIX }) {
  const { makeFakePg } = require('./_fake-pg.cjs')
  const SEEDS = require('./_country-settings-gb.cjs')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'
  const CS = [snake(SEEDS.gbFromSeed()), snake(SEEDS.usFromSeed())]
  const out = {}
  const safe = async (id, f) => { try { out[id] = await f() } catch (e) { out[id] = 'ERROR ' + String((e && e.stack) || e).slice(0, 300) } }
  const clear = "\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"

  // ── the modules (each bundled once; a bundle that cannot be built on this code is recorded per view) ──
  const tryBundle = async (tag, entry, o) => { try { return await kit.bundle(tag, entry, o) } catch (e) { return { __err: 'ERROR bundle: ' + String(e && e.message || e).slice(0, 200) } } }
  const FEED = await tryBundle('mn-public-feed', "export { GET } from '@/app/api/discovery/events/route'" + clear)
  const EMBED = await tryBundle('mn-public-embed', "export { GET } from '@/app/api/embed/events/route'" + clear)
  const WA = await tryBundle('mn-public-wa', "export { fetchUpcomingTruckEvents } from '@/lib/whatsapp/upcoming-events'\nexport { __fmtEventForPrompt } from '@/lib/whatsapp-classifier'" + clear,
    { patches: [{ file: 'lib/whatsapp-classifier.ts', append: 'export { formatEventForPrompt as __fmtEventForPrompt }' }] })
  const WP = await tryBundle('mn-public-wp', "export { POST } from '@/app/api/weekly-post/route'" + clear, { stubs: WP_STUBS })
  const UTIL = await tryBundle('mn-public-utils', "export { getGoogleLink, getOutlookLink, downloadICS } from '@/lib/utils'")
  const HOME = await tryBundle('mn-public-home', "export { default } from '@/app/page'",
    { stubs: PAGE_STUBS, patches: [{ file: 'hooks/useVillageData.ts', states: ['events', 'loading'] }, { file: 'app/page.tsx', states: ['filters'] }] })
  const PAGE = await tryBundle('mn-public-truckpage', "export { default } from '@/app/trucks/[slug]/page'" + clear,
    { stubs: { ...PAGE_STUBS, '@/hooks/useVillageData': 'export function useVillageData() { return globalThis.__tcData }' } })
  // EmbedSchedule's list comes from its own state (a fetch in an effect): start it from the embed route's real JSON.
  // BEFORE has no `time` state, so the patch names only what that code has.
  const EMB_UI = (await tryBundle('mn-public-embedui', "export { default } from '@/app/embed/[slug]/EmbedSchedule'", { patches: [{ file: 'app/embed/[slug]/EmbedSchedule.tsx', states: ['events', 'time'] }] }))
  const EMB_UI0 = EMB_UI.__err ? await tryBundle('mn-public-embedui0', "export { default } from '@/app/embed/[slug]/EmbedSchedule'", { patches: [{ file: 'app/embed/[slug]/EmbedSchedule.tsx', states: ['events'] }] }) : EMB_UI
  // The edge function: Deno globals stood in for; the handler is captured from Deno.serve.
  globalThis.Deno = { env: { get: () => 'harness' }, serve: h => { globalThis.__denoHandler = h } }
  const SCHED = await tryBundle('mn-public-sched', "export * from '@/supabase/functions/auto-event-scheduler/index'")
  const schedHandler = globalThis.__denoHandler
  const EW = await tryBundle('mn-public-ew', "export * from '@/lib/event-window'")   // this tree only (BEFORE: no such file)
  const clearAll = () => { for (const m of [FEED, EMBED, WA, WP, PAGE]) if (m && m.clearCountrySettingsCache) m.clearCountrySettingsCache() }
  const need = m => { if (!m || m.__err) throw new Error(m ? m.__err : 'no module') }

  // ── the world: one truck in country `cc`, one event (`times`) on 30 September, and its scraped twin at another venue ──
  function world(cc, times, extra = {}) {
    const truck = { id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', country: cc, timezone: null, active: true, excluded: false,
      show_on_vf: true, show_on_hg: true, order_link_vf: false, order_link_hg: true, embed_enabled: true, dashboard_token: 'tok-public',
      plan: 'max', feature_overrides: {}, trial_expires_at: null, cuisine_type: 'Pizza', logo_storage_path: null, cover_image_path: null,
      contact_phone: null, website: null, phone_is_whatsapp: false }
    const ev = (id, date, status = 'confirmed', more = {}) => ({ ...FIX.eventRow(id, times, { event_date: date, status, is_private: false, venue_id: null, truck_place_id: null, ...more }), trucks: truck })
    const dt = { id: 'dt-kitchen', name: 'Pizza Kitchen', aliases: [], country: cc, show_on_vf: true, show_on_hg: true, excluded: false, exclude_reason: null,
      cuisine: 'Pizza', phone: null, order_url: null, accepted_methods: null, notes: null, website: null, menu_url: null, logo_url: null, photo_url: null, hatchgrab_truck_id: null }
    const scraped = { id: 'de-1', event_date: FIX.EVENT_DATE, ...times, truck_name: 'Pizza Kitchen', venue_name: 'Village Green', village: 'Springfield', event_notes: null,
      discovery_truck_id: 'dt-kitchen', venue_id: null, show_on_vf: true, show_on_hg: true, superseded_by: null, country: cc, discovery_trucks: dt, venues: null }
    return { trucks: [truck], truck_events: [ev('ev-1', FIX.EVENT_DATE), ...(extra.events || []).map(([id, d, st, more]) => ev(id, d, st, more))],
      discovery_trucks: [dt], discovery_events: [scraped], venues: [], country_settings: CS, truck_places: [], truck_post_designs: [], place_pictures: [] }
  }
  const useDb = w => { const pg = makeFakePg(w); globalThis.__harnessDb = pg; clearAll(); return pg }
  const brief = list => (list || []).map(e => [e.date, String(e.startTime).slice(0, 5), String(e.endTime).slice(0, 5), e.venueName, e.source, e.status ?? null])
  const later = Array.from({ length: 10 }, (_, i) => [`ev-later-${i}`, `2026-10-${String(2 + i).padStart(2, '0')}`, 'confirmed'])

  for (const [kind, times, moments] of [['normal', FIX.NORMAL, FIX.NORMAL_MOMENTS], ['midnight', FIX.MIDNIGHT, FIX.MIDNIGHT_MOMENTS]]) {
    for (const cc of ['GB', 'US']) {
      const tz = FIX.COUNTRIES[cc].tz
      const vEvent = { id: 'ev-1', date: '30/09/2026', startTime: times.start_time, endTime: times.end_time, truckName: 'Pizza Kitchen', venueName: 'Market Square',
        village: 'Springfield', postcode: 'CB1 1AA', notes: '', eventNotes: '', source: 'operator', status: 'confirmed', orderLinkHg: true, orderLinkVf: false, type: 'Pizza' }
      // ── calendar links (no clock but DTSTAMP) ──
      kit.setNow(FIX.utcOf(cc, FIX.EVENT_DATE, '12:00'))
      await safe(`${kind}|${cc}|-|cal-google`, () => { need(UTIL); return UTIL.getGoogleLink(vEvent) })
      await safe(`${kind}|${cc}|-|cal-outlook`, () => { need(UTIL); return UTIL.getOutlookLink(vEvent) })
      await safe(`${kind}|${cc}|-|cal-ics`, () => {
        need(UTIL)
        let ics = null
        const saved = { window: globalThis.window, document: globalThis.document, Blob: globalThis.Blob }
        globalThis.window = { URL: { createObjectURL: () => 'blob:harness' } }
        globalThis.document = { createElement: () => ({ setAttribute() {}, click() {} }), body: { appendChild() {}, removeChild() {} } }
        globalThis.Blob = class { constructor(parts) { ics = parts.join('') } }
        try { UTIL.downloadICS(vEvent) } finally { Object.assign(globalThis, saved) }
        return ics
      })

      // MIDNIGHT FOLLOW-UPS (17 October 2026, docs/midnight-followups-report.md): two extra moments on the NORMAL event for the
      // truck-clock "today" decision — GB at 00:30 BST the next day (its UTC date was still the event's), US at 21:00 EDT
      // (its UTC date was already the next day). Their views are `fu|…`: asserted by checks, not compared with BEFORE.
      const FU = { GB: [['fu-00:30', FIX.NEXT_DATE, '00:30']], US: [['fu-21:00', FIX.EVENT_DATE, '21:00']] }
      for (const [label, ymd, hhmm] of (kind === 'normal' ? [...moments, ...FU[cc]] : moments)) {
        const p = label.startsWith('fu-') ? `fu|${cc}|${label.slice(3)}` : `${kind}|${cc}|${label}`
        kit.setNow(FIX.utcOf(cc, ymd, hhmm))
        kit.setDeviceTz(tz)
        // ── the discovery feed, both hosts ──
        for (const [host, k] of [['www.villagefoodie.co.uk', 'feed-vf'], ['www.hatchgrab.com', 'feed-hg']]) {
          await safe(`${p}|${k}`, async () => {
            need(FEED); useDb(world(cc, times))
            const res = await kit.quietAsync(() => FEED.GET(new NextRequest(`http://${host}/api/discovery/events`, { headers: { host } })))
            return brief((await res.json()).events)
          })
        }
        // ── the embed route ──
        let embedJson = null
        await safe(`${p}|embed`, async () => {
          need(EMBED); useDb(world(cc, times))
          const res = await kit.quietAsync(() => EMBED.GET(new NextRequest('http://www.hatchgrab.com/api/embed/events?slug=test-kitchen')))
          embedJson = await res.json()
          return brief(embedJson.events)
        })
        // ── WhatsApp: the upcoming window (with ten later events, so the limit shows) and the prompt line ──
        await safe(`${p}|wa-upcoming`, async () => {
          need(WA); const pg = useDb(world(cc, times, { events: later }))
          const rows = await kit.quietAsync(() => WA.fetchUpcomingTruckEvents(pg, 'test-truck', tz))
          return rows.map(r => [r.id, r.event_date, String(r.start_time).slice(0, 5), String(r.end_time).slice(0, 5)])
        })
        await safe(`${p}|wa-prompt`, () => {
          need(WA)
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
          return WA.__fmtEventForPrompt({ event_date: FIX.EVENT_DATE, ...times, venue_name: 'Market Square', town: 'Springfield', postcode: 'CB1 1AA', status: 'confirmed' }, today, FIX.time(cc))
        })
        // ── the weekly post's single-event pickers ──
        for (const [action, k, pick] of [['social_overview', 'wp-overview', j => (j.upcoming || []).map(e => [e.id, e.date])], ['event_load', 'wp-load', j => (j.nextEvents || []).map(e => [e.id, e.date])]]) {
          await safe(`${p}|${k}`, async () => {
            need(WP); useDb(world(cc, times, { events: later.slice(0, 2) }))
            const res = await kit.quietAsync(() => WP.POST(new NextRequest('http://www.hatchgrab.com/api/weekly-post', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-public', action }) })))
            const j = await res.json()
            return res.status === 200 ? pick(j) : `HTTP ${res.status} ${JSON.stringify(j).slice(0, 160)}`
          })
        }
        // ── the home page's list, on the device clock (the real useVillageData, started with the feed's events) ──
        for (const [date, k] of [['all', 'home-all'], ['today', 'home-today']]) {
          await safe(`${p}|${k}`, () => {
            need(HOME)
            const html = kit.renderWith({ events: [vEvent], loading: false, filters: { date, cuisine: 'all', distance: '11' } }, kit.h(HOME.default))
            return { listed: html.text.includes('Market Square'), empty: html.text.includes('No events found') }
          })
        }
        // ── the edge function: what it opens and closes ──
        await safe(`${p}|sched`, async () => {
          if (!schedHandler) throw new Error('no handler captured')
          const pg = useDb(world(cc, times, { events: [
            ['open-ac', FIX.EVENT_DATE, 'open', { auto_close: true }], ['open-manual', FIX.EVENT_DATE, 'open', { auto_close: false }],
            ['open-old', '2026-09-29', 'open', { auto_close: false }], ['conf-ao', FIX.EVENT_DATE, 'confirmed', { auto_open: true }],
          ] }))
          pg.tables.truck_events = pg.tables.truck_events.filter(r => r.id !== 'ev-1')
          await kit.quietAsync(() => schedHandler())
          const ids = op => pg.writes.filter(w => w.table === 'truck_events' && w.op === 'update' && w.patch.status === op).flatMap(w => w.ids).sort()
          return { opened: ids('open'), closed: ids('closed') }
        })
        // the embed card at this moment (the custom-domain schedule) — only for the format views below
        if (kind === 'normal' && label === '12:00') out[`__embedJson|${cc}`] = embedJson
      }

      // ── FORMAT: TruckListCard as the public truck page and the custom-domain schedule render it ──
      if (kind === 'normal') {
        kit.setNow(FIX.utcOf(cc, FIX.EVENT_DATE, '12:00')); kit.setDeviceTz(tz)
        const fmtId = (what) => `${cc === 'GB' ? 'normal' : 'midnight'}|${cc}|fmt|${what}`
        // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-2-live-on-date-line (components/TruckListCard.tsx): the range used to
        // sit in a bare <span> inside the time line ("…text-slate-500 leading-none mt-0.5\"><span>11:30 – 22:45</span>"); it is
        // now that line's own text ("…text-slate-500 leading-none mt-0.5\">11:30 – 22:45</span>"), with "● Live" moved up
        // beside the date. The extractor reads the range by its line's classes, with the old inner <span> optional, so it
        // reads both markups the same way (BEFORE's stored cards were taken with the old form).
        const cardText = html => [...html.matchAll(/text-orange-600 leading-none">([^<]*)<\/span>[\s\S]*?text-slate-500 leading-none mt-0\.5">(?:<span>)?([^<]*)<\/span>/g)].map(m => `${m[1]} · ${m[2]}`)
        // the public truck page: the SERVER page decides the settings (a HatchGrab truck's; none for a discovery-only one)
        for (const [what, hasRow] of [['public-page', true], ['public-page-discovery-only', false]]) {
          await safe(fmtId(what), async () => {
            need(PAGE)
            // /trucks/<slug> finds its events by the NAME's slug, so here the truck's `slug` column agrees with it.
            const w = world(cc, times); w.trucks[0].slug = 'pizza-kitchen'; if (!hasRow) w.trucks = []
            useDb(w)
            const el = await kit.quietAsync(() => PAGE.default({ params: Promise.resolve({ slug: 'pizza-kitchen' }) }))
            globalThis.__tcData = { loading: false, loadError: false, refetch() {}, mapEvents: [{ ...vEvent, startTime: '11:30:00', endTime: '22:45:00' }],
              allTrucks: [{ rawName: 'Pizza Kitchen', cleanKey: 'pizza-kitchen', type: 'Pizza' }] }
            try {
              const html = kit.renderStatic(el)
              return { cards: cardText(html), html: cc === 'GB' ? html : undefined }
            } finally { delete globalThis.__tcData }
          })
        }
        await safe(fmtId('embed'), () => {
          const M = EMB_UI.__err ? EMB_UI0 : EMB_UI
          need(M)
          const j = out[`__embedJson|${cc}`] || {}
          const html = kit.renderStatic(kit.h(() => { globalThis.__ms = { events: j.events || [], time: j.time ?? null }; return kit.h(M.default, { slug: 'test-kitchen', truckName: 'Pizza Kitchen' }) }))
          delete globalThis.__ms
          return { cards: cardText(html), html: cc === 'GB' ? html : undefined }
        })
        await safe(`midnight|${cc}|fmt|embed-time-${cc}`, () => (out[`__embedJson|${cc}`] || {}).time ?? null)
      }
    }
  }
  for (const k of Object.keys(out)) if (k.startsWith('__')) delete out[k]

  // ── PARITY: the edge function's mirrored rule against lib/event-window.ts (this tree only) ──
  await safe('midnight|GB|-|sched-parity', () => {
    if (SCHED.__err || typeof SCHED.shouldAutoClose !== 'function') return 'n/a — no shouldAutoClose on this code'
    need(EW)
    const days = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']
    const mismatches = []; let n = 0
    for (const times of [FIX.NORMAL, FIX.MIDNIGHT, { start_time: '18:00:00', end_time: '00:00:00' }, { start_time: '23:30:00', end_time: '23:00:00' }]) {
      const endOn = EW.eventEndMins(times.start_time, times.end_time)
      const endDay = Math.floor(endOn / 1440)
      for (const auto_close of [true, false]) {
        for (const today of days) {
          for (let m = 0; m < 1440; m += 5) {
            const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
            const day = EW.daysBetween(FIX.EVENT_DATE, today)
            const nowOn = day * 1440 + m
            // the rule, from lib/event-window.ts: not before its date; swept the day after its END date; on its end
            // date, closed by auto_close once now (on the event's timeline) has reached its end.
            const want = day < 0 ? false : day > endDay ? true : day < endDay ? false : (auto_close && nowOn >= endOn)
            const got = SCHED.shouldAutoClose({ event_date: FIX.EVENT_DATE, ...times, auto_close }, today, hhmm)
            n++
            if (got !== want) mismatches.push([times.start_time, times.end_time, auto_close, today, hhmm, got, want])
          }
        }
      }
    }
    return { compared: n, mismatches: mismatches.slice(0, 10), mismatchCount: mismatches.length }
  })
  return out
}

function checks(t, A, B) {
  // ── MIDNIGHT FOLLOW-UPS · decision 3: "today" is the truck's own date, for every event ──
  for (const k of ['feed-hg', 'embed']) {
    t(`fu GB ${k}: at 00:30 BST the next day, yesterday's normal event is NOT listed (BEFORE listed it: its UTC date was still the event's)`,
      Array.isArray(A[`fu|GB|00:30|${k}`]) && A[`fu|GB|00:30|${k}`].length === 0 && Array.isArray(B[`fu|GB|00:30|${k}`]) && B[`fu|GB|00:30|${k}`].length === 1, [A[`fu|GB|00:30|${k}`], B[`fu|GB|00:30|${k}`]])
    t(`fu US ${k}: at 21:00 EDT today's normal event IS listed (BEFORE dropped it: its UTC date was already the next day)`,
      Array.isArray(A[`fu|US|21:00|${k}`]) && A[`fu|US|21:00|${k}`].length === 1 && Array.isArray(B[`fu|US|21:00|${k}`]) && B[`fu|US|21:00|${k}`].length === 0, [A[`fu|US|21:00|${k}`], B[`fu|US|21:00|${k}`]])
  }

  const fs = require('fs'); const REPO = path.resolve(__dirname, '..')
  const has = (list, venue) => Array.isArray(list) && list.some(r => r[3] === venue)
  const ids = list => (Array.isArray(list) ? list.map(r => r[0]) : list)
  for (const cc of ['GB', 'US']) {
    const v = (m, w) => A[`midnight|${cc}|${m}|${w}`]
    // the discovery feed — operator leg (both hosts) and scraped leg (VF, GB only: Village Foodie's market)
    for (const [w, venue, label] of [['feed-hg', 'Market Square', 'HatchGrab feed (operator event)'], ['feed-vf', 'Market Square', 'Village Foodie feed (operator event)'], ['feed-vf', 'Village Green', 'Village Foodie feed (scraped event)']]) {
      if (w === 'feed-vf' && cc === 'US') continue   // a US truck is not on Village Foodie at all (unchanged)
      t(`public ${cc}: the ${label} lists the 20:00–00:30 event at 19:00, 23:50 and 00:15 (next day); not at 00:31 or the next afternoon`,
        has(v('19:00', w), venue) && has(v('23:50', w), venue) && has(v('00:15', w), venue) && !has(v('00:31', w), venue) && !has(v('next-afternoon', w), venue),
        ['19:00', '23:50', '00:15', '00:31', 'next-afternoon'].map(m => [m, has(v(m, w), venue)]))
    }
    t(`public ${cc}: the US truck's event is never on Village Foodie (unchanged)`, cc === 'GB' || ['19:00', '00:15'].every(m => !has(v(m, 'feed-vf'), 'Market Square')))
    t(`public ${cc}: the embed (custom-domain schedule) lists it at 19:00, 23:50, 00:15; not at 00:31 or the next afternoon`,
      has(v('19:00', 'embed'), 'Market Square') && has(v('23:50', 'embed'), 'Market Square') && has(v('00:15', 'embed'), 'Market Square') && !has(v('00:31', 'embed'), 'Market Square') && !has(v('next-afternoon', 'embed'), 'Market Square'),
      ['19:00', '23:50', '00:15', '00:31', 'next-afternoon'].map(m => [m, v(m, 'embed')]))
    // WhatsApp
    const wa = m => ids(v(m, 'wa-upcoming'))
    t(`public ${cc}: WhatsApp's upcoming window holds the event (first) at 23:50 and 00:15, with the limit of 10 applied after the rule`,
      Array.isArray(wa('00:15')) && wa('00:15')[0] === 'ev-1' && wa('00:15').length === 10 && wa('23:50')[0] === 'ev-1', { '23:50': wa('23:50'), '00:15': wa('00:15') })
    t(`public ${cc}: …and not at 00:31: the ten later events fill the window`, Array.isArray(wa('00:31')) && !wa('00:31').includes('ev-1') && wa('00:31').length === 10, wa('00:31'))
    const pr = v('00:15', 'wa-prompt'), pr19 = v('19:00', 'wa-prompt')
    t(`public ${cc}: the prompt says the event ends after midnight (19:00) and, at 00:15, that it started yesterday and is still on`,
      typeof pr19 === 'string' && /ends after midnight/.test(pr19) && /\(TODAY\)/.test(pr19) && typeof pr === 'string' && /STARTED YESTERDAY, ENDS THIS MORNING/.test(pr), [pr19, pr])
    // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-1-nbsp: each US 12-hour time carries U+00A0 before AM/PM (the "–" here is
    // the prompt's own join, no space either side, so nothing else moves). GB unchanged.
    t(`public ${cc}: the prompt line reads the truck's style (${cc === 'GB' ? '20:00–00:30' : '8:00 PM–12:30 AM, U+00A0 before PM/AM'})`, typeof pr19 === 'string' && pr19.includes(cc === 'GB' ? '20:00–00:30' : '8:00\u00A0PM–12:30\u00A0AM'), pr19)
    // weekly post
    for (const w of ['wp-overview', 'wp-load']) {
      t(`public ${cc}: weekly post ${w === 'wp-overview' ? 'social_overview' : 'event_load'} offers the event at 23:50 and 00:15, not at 00:31`,
        (ids(v('23:50', w)) || []).includes?.('ev-1') && (ids(v('00:15', w)) || []).includes?.('ev-1') && Array.isArray(v('00:31', w)) && !ids(v('00:31', w)).includes('ev-1'),
        ['23:50', '00:15', '00:31'].map(m => [m, v(m, w)]))
    }
    // the home page (device clock in the zone)
    for (const w of ['home-all', 'home-today']) {
      const listed = m => (v(m, w) || {}).listed
      t(`public ${cc}: the home list (${w === 'home-all' ? 'all dates' : '“Today”'}) shows the event at 19:00, 23:50 and 00:15; not at 00:31`,
        listed('19:00') && listed('23:50') && listed('00:15') && listed('00:31') === false, ['19:00', '23:50', '00:15', '00:31'].map(m => [m, listed(m)]))
    }
    t(`public ${cc}: BEFORE hid it on the home list from 20:00 (its end "00:30" read as before its start)`, (B[`midnight|${cc}|23:50|home-all`] || {}).listed === false, B[`midnight|${cc}|23:50|home-all`])
    // calendar links end the NEXT morning
    t(`public ${cc}: Google Calendar's entry runs 30 Sep 20:00 → 1 Oct 00:30`, /dates=20260930T2000[^/]*\/20261001T0030/.test(A[`midnight|${cc}|-|cal-google`] || ''), A[`midnight|${cc}|-|cal-google`])
    t(`public ${cc}: Outlook's entry ends 2026-10-01T00:30`, /startdt=2026-09-30T20:00[^&]*&enddt=2026-10-01T00:30/.test(A[`midnight|${cc}|-|cal-outlook`] || ''), A[`midnight|${cc}|-|cal-outlook`])
    t(`public ${cc}: the .ics DTEND is on 1 October`, /DTSTART:20260930T2000[\s\S]*DTEND:20261001T0030/.test(A[`midnight|${cc}|-|cal-ics`] || ''), (A[`midnight|${cc}|-|cal-ics`] || '').split('\r\n').filter(l => /^DT(START|END)/.test(l)))
    // the edge function
    const s = m => v(m, 'sched') || {}
    t(`public ${cc}: auto-close leaves the event open on its own date (19:00, 23:50)`, !(s('19:00').closed || []).includes('open-ac') && !(s('23:50').closed || []).includes('open-ac') && !(s('23:50').closed || []).includes('open-manual'), [s('19:00'), s('23:50')])
    t(`public ${cc}: …the prior-day sweep does NOT close it while it runs (00:15): neither the auto_close nor the manual copy`, !(s('00:15').closed || ['?']).includes('open-ac') && !(s('00:15').closed || ['?']).includes('open-manual'), s('00:15'))
    t(`public ${cc}: …at 00:31 the auto_close copy is closed; the manual one is left for the operator`, (s('00:31').closed || []).includes('open-ac') && !(s('00:31').closed || []).includes('open-manual'), s('00:31'))
    t(`public ${cc}: …an overnight event two days old is swept at once`, (s('00:15').closed || []).includes('open-old'), s('00:15'))
    t(`public ${cc}: BEFORE closed it at 23:50 on its own date (auto_close, "00:30" ≤ "23:50") and swept it at 00:15`, (B[`midnight|${cc}|23:50|sched`] || {}).closed?.includes('open-ac') && (B[`midnight|${cc}|00:15|sched`] || {}).closed?.includes('open-manual'), [B[`midnight|${cc}|23:50|sched`], B[`midnight|${cc}|00:15|sched`]])
  }
  const par = A['midnight|GB|-|sched-parity'] || {}
  t('public: PARITY — the edge function\'s shouldAutoClose agrees with lib/event-window.ts on every one of 4 shapes × auto_close × 5 days × 288 minutes', par.compared === 4 * 2 * 5 * 288 && par.mismatchCount === 0, par)
  // US format
  const us = A['midnight|US|fmt|public-page'] || {}, use = A['midnight|US|fmt|embed'] || {}
  // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-1-nbsp: a 12-hour formatTimeRange also writes U+00A0 BEFORE the dash, so
  // the range breaks only after it. (U+00A0 before AM/PM was already the card's own rule.) Written as escapes.
  const want = 'Wed, Sep 30 · 11:30\u00A0AM\u00A0– 10:45\u00A0PM'
  t('public US: the public truck page\'s card reads the truck\'s style, each time kept whole: "Wed, Sep 30 · 11:30 AM – 10:45 PM" (U+00A0 before AM/PM)', (us.cards || [])[0] === want, us)
  t('public US: the custom-domain schedule\'s card reads the same', (use.cards || [])[0] === want, use)
  const usTime = A['midnight|US|fmt|embed-time-US'] || {}
  t('public US: the embed route sends the truck\'s TimeSettings (America/New_York, en-US, 12h, mdy)', usTime.timeZone === 'America/New_York' && usTime.locale === 'en-US' && usTime.timeFormat === '12h' && usTime.dateOrder === 'mdy', usTime)
  t('public US: BEFORE showed the US truck\'s cards in the GB style ("Wed 30 Sep · 11:30 – 22:45")', ((B['midnight|US|fmt|public-page'] || {}).cards || [])[0] === 'Wed 30 Sep · 11:30 – 22:45', B['midnight|US|fmt|public-page'])
  t('public GB: the GB cards read "Wed 30 Sep · 11:30 – 22:45" (24h, no AM/PM, byte-identical)', ((A['normal|GB|fmt|public-page'] || {}).cards || [])[0] === 'Wed 30 Sep · 11:30 – 22:45' && ((A['normal|GB|fmt|embed'] || {}).cards || [])[0] === 'Wed 30 Sep · 11:30 – 22:45')
  const gbTime = A['midnight|GB|fmt|embed-time-GB'] || {}
  t('public GB: a GB HatchGrab truck\'s settings equal DISCOVERY_TIME_SETTINGS (Europe/London, en-GB, 24h, dmy, monday)', gbTime.timeZone === 'Europe/London' && gbTime.locale === 'en-GB' && gbTime.timeFormat === '24h' && gbTime.dateOrder === 'dmy' && gbTime.weekStart === 'monday', gbTime)
  // one read for WhatsApp: no inline copy left in either webhook
  for (const f of ['app/api/webhooks/meta/whatsapp/route.ts', 'app/api/webhooks/whatsapp/route.ts']) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8')
    t(`public: ${f} reads its upcoming events through fetchUpcomingTruckEvents (no inline copy)`, /fetchUpcomingTruckEvents\(supabase, truck\.id, truckTime\.timeZone\)/.test(src) && !/\.gte\('event_date'/.test(src))
  }
}

/* ══ NAMED (MIDNIGHT FOLLOW-UPS, 17 October 2026, Dominic's decision 3, docs/midnight-followups-report.md) ═════════════════
 * /api/discovery/events' operator leg (feed-hg) and /api/embed/events decide "today" on the TRUCK's clock for every event
 * (was the UTC date). Expected, from the rule: the operator rows BEFORE listed at midday on the event's date (the truck's
 * today, every row upcoming), kept when dated on or after the truck's own date at the moment. US at 22:40 / 22:50 EDT (UTC
 * already the next day) now keeps today's event; every other moment is unchanged. */
const ddmm2ymd = d => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`
/* ══ NAMED (US layout fixes, 18 October 2026, /Users/dominicbonini/dev/usl-out/REPIN-BRIEF.md) ══════════════════════════════
 * us-layout-fix-2-live-on-date-line (components/TruckListCard.tsx) — the GB format views' stored HTML (the public truck page,
 * its discovery-only form, the custom-domain schedule: normal|GB|fmt|*). On these FULL, NOT-LIVE cards the date gains a
 * wrapping flex <span> (where "● Live" now sits when live) and the range, which sat in a bare <span> inside a flex time line,
 * is now that line's own text with the line's classes trimmed to "text-[12px] font-bold text-slate-500 leading-none mt-0.5".
 * Exact markup, each card matched in full; if any card is not that form (a live or compact one) nothing is transformed and
 * the view fails. The text the cards read ("Wed 30 Sep · 11:30 – 22:45") is unchanged. */
const FIX2_FULL_CARD = /<span class="text-\[13px\] sm:text-sm font-bold text-orange-600 leading-none">([^<]*)<\/span><span class="flex items-center gap-2 text-\[12px\] font-bold text-slate-500 leading-none mt-0\.5"><span>([^<]*)<\/span><\/span>/g
const fix2FullCard = html => html.replace(FIX2_FULL_CARD, (m, date, range) =>
  `<span class="flex items-center gap-2 leading-none whitespace-nowrap"><span class="text-[13px] sm:text-sm font-bold text-orange-600 leading-none">${date}</span></span><span class="text-[12px] font-bold text-slate-500 leading-none mt-0.5">${range}</span>`)
function named(id, before, B) {
  if (/^normal\|GB\|fmt\|(public-page|public-page-discovery-only|embed)$/.test(id) && before && typeof before.html === 'string') {
    const n = (before.html.match(FIX2_FULL_CARD) || []).length
    if (!n || n !== (before.cards || []).length) return before
    return { ...before, html: fix2FullCard(before.html) }
  }
  // us-layout-fix-1-nbsp (lib/time-utils.ts clockOf): the US WhatsApp prompt's event line ("11:30 AM–10:45 PM") carries
  // U+00A0 before each AM/PM; nothing else in the prompt moves. GB: none.
  if (/^normal\|US\|[^|]+\|wa-prompt$/.test(id) && typeof before === 'string') return before.replace(/(\d{1,2}:\d{2}) (AM|PM)\b/g, '$1\u00A0$2')
  const m = /^normal\|(GB|US)\|([^|]+)\|(feed-hg|embed)$/.exec(id)
  if (!m) return before
  const FIX = require('./_midnight-fixtures.cjs')
  const moment = FIX.NORMAL_MOMENTS.find(x => x[0] === m[2])
  const noon = B[`normal|${m[1]}|12:00|${m[3]}`]
  if (!moment || !Array.isArray(noon)) return before
  const truckToday = moment[1]
  return noon.filter(r => ddmm2ymd(r[0]) >= truckToday)
}

module.exports = { views, checks, named }
