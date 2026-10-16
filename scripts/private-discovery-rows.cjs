#!/usr/bin/env node
// scripts/private-discovery-rows.cjs — A SCRAPED ROW THAT NAMES NO PUBLIC PLACE IS NEVER PUBLIC (16 October 2026,
// docs/private-discovery-rows-report.md).
//
//   node scripts/private-discovery-rows.cjs
//
// ── 🔴 WHAT HAPPENED ─────────────────────────────────────────────────────────────────────────────────────────
// Every discovery_events row was written `visibility 'public'`, `show_on_vf/hg true` — including "Private Hire",
// "Private Event" and "Closed". The public feed (/api/discovery/events — the ONLY public reader of discovery_events,
// behind Village Foodie's map, lists, truck and venue pages; on the HatchGrab host it serves operator events only)
// filters on show_on_*,
// the truck's own flags, the country, the date and superseded_by; nothing about the title. So a shown truck's
// "Closed" day reached its public page as an event (live: Marky D's, 24 Dec and 3 Jan); Gusto's private bookings were
// hidden only because Gusto's scraped truck is excluded.
// This runs the REAL modules on the in-memory database (scripts/_fake-pg.cjs) — fixtures only, Pizza Kitchen
// ('test-truck', 'test-kitchen'), nothing live — and proves:
//   1. the rule: generic titles (lib/generic-venue-names.json) and the truck_events.is_private rule ("private" as a
//      whole word in the venue or notes) are non-public; real names are not;
//   2. the gate (every insert into discovery_events) stores such a row visibility 'hidden', show_on_vf/hg false; a
//      named-venue row is stored exactly as before; another country's row is unchanged;
//   3. the email bridge still turns a private row into the operator's private truck event (HatchGrab unchanged);
//   4. the feed never serves such a row on Village Foodie (the HatchGrab host serves no scraped rows at all, unchanged) even when it was STORED public (the rows written before the
//      fix) — and its output is otherwise byte-identical to the same feed with the guard removed;
//   5. the public truck page: the old feed showed "Closed" as an event card; the new one does not.
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'private-discovery-rows' })
const { REPO } = kit
const { makeFakePg, KEYS_BOTH, COUNTRY_DEFAULTS } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
process.env.INBOUND_SCHEDULE_SECRET = 'harness-secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
process.env.SUPABASE_URL = 'http://127.0.0.1:9'
process.env.TZ = 'Europe/London'
const STUBS = {
  '@/lib/email': 'export async function sendConfirmationEmail(m) { (globalThis.__emails = globalThis.__emails || []).push({ to: m.to, subject: m.subject }); return { ok: true } }',
  '@/lib/auth/admin': 'export async function verifyAdmin() { return true }',
}
const PAGE_STUBS = {
  'next/script': "import { createElement } from 'react'\nexport default function Script(p) { return createElement('script', { 'data-src': p.src || '' }) }",
  'next/dynamic': 'export default function dynamic() { return function Dynamic() { return null } }',
  'posthog-js/react': 'export const usePostHog = () => null\nexport function PostHogProvider(p) { return p.children }',
  '@/hooks/useVillageData': 'export function useVariant() { return null }\nexport function useVillageData() { return globalThis.__tcData }',
}

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${JSON.stringify(detail).slice(0, 600)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

// ── a small GB world: Pizza Kitchen's SCRAPED listing (shown, not linked — like Marky D's) and the HatchGrab test truck ──
const GB = snake(SEEDS.gbFromSeed())
function world() {
  const dt = { id: 'dt-kitchen', name: 'Pizza Kitchen', aliases: [], country: 'GB', show_on_vf: true, show_on_hg: true, excluded: false, exclude_reason: null,
    cuisine: 'Pizza', phone: null, order_url: null, accepted_methods: null, notes: null, website: null, menu_url: null, logo_url: null, photo_url: null, hatchgrab_truck_id: null }
  const venues = [{ id: 'v-redlion', name: 'Red Lion', village: 'Cambridge', latitude: 52.2053, longitude: 0.1218, postcode: 'CB2 1AA', country: 'GB', phone: null, website: null, photo_url: null }]
  // rows as they were STORED before the fix — every one public
  const ev = (id, date, venue, extra = {}) => ({ id, event_date: date, start_time: '17:00', end_time: '21:00', truck_name: 'Pizza Kitchen', venue_name: venue,
    village: venue === 'Red Lion' ? 'Cambridge' : null, event_notes: null, source: 'URL', ai_notes: null, discovery_truck_id: 'dt-kitchen',
    venue_id: venue === 'Red Lion' ? 'v-redlion' : null, show_on_vf: true, show_on_hg: true, visibility: 'public', superseded_by: null, country: 'GB',
    created_at: '2026-10-01T09:00:00.000Z', ...extra })
  const discovery_events = [
    ev('de-1', '2026-10-20', 'Red Lion'),
    ev('de-2', '2026-10-21', 'Closed'),
    ev('de-3', '2026-10-22', 'Private Hire'),
    ev('de-4', '2026-10-23', 'Village Hall', { event_notes: 'Private booking — not open to the public' }),
    ev('de-5', '2026-10-24', 'Red Lion', { start_time: '12:00', end_time: '14:00' }),
  ]
  const trucks = [{ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', contact_email: null, dashboard_token: 'tok', timezone: 'Europe/London',
    country: 'GB', scraper_preference: 'auto', active: true, excluded: false, show_on_vf: true, show_on_hg: true }]
  return { discovery_trucks: [dt], venues, discovery_events, trucks, truck_events: [], truck_vans: [], rejected_event_signatures: [],
    discovery_exclusion_terms: [], country_settings: [GB, snake({ ...SEEDS.usFromSeed(), enabled: false })] }
}
const db = () => { const pg = makeFakePg(world(), { keys: KEYS_BOTH, defaults: COUNTRY_DEFAULTS }); globalThis.__harnessDb = pg; globalThis.__emails = []; return pg }

;(async () => {
  kit.setNow('2026-10-16T14:20:00.000Z')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const clear = "\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"
  const H = await kit.bundle('pdr-helper', "export * from '@/lib/discovery-private'")
  const GATE = await kit.bundle('pdr-gate', "export * from '@/lib/discovery-gate'" + clear, { stubs: STUBS })
  const INB = await kit.bundle('pdr-inbound', "export { POST } from '@/app/api/inbound-schedule/route'" + clear, { stubs: STUBS })
  const FEED = await kit.bundle('pdr-feed', "export { GET } from '@/app/api/discovery/events/route'" + clear, { stubs: STUBS })
  // the same feed WITHOUT the new guard — what the public saw before the fix (the patch must apply, or this throws)
  const FEED0 = await kit.bundle('pdr-feed-before', "export { GET } from '@/app/api/discovery/events/route'" + clear, { stubs: STUBS,
    patches: [{ file: 'app/api/discovery/events/route.ts', from: 'if (isNonPublicDiscoveryRow(e)) return null', to: '/* guard removed for the BEFORE render */' }] })
  const TC = await kit.bundle('pdr-truck', "export { default } from '@/app/trucks/[slug]/TruckClient'", { stubs: PAGE_STUBS })
  const clearAll = () => { for (const m of [GATE, INB, FEED, FEED0]) if (m.clearCountrySettingsCache) m.clearCountrySettingsCache() }

  // 1 ── the rule
  head('1 · the rule: no public place → non-public')
  for (const v of ['Private Event', 'Private Hire', 'private party', 'Closed', 'TBC', 'Event', 'Corporate Lunch']) t(`"${v}" is non-public`, H.isNonPublicDiscoveryRow({ venue_name: v }) === true)
  t('"The Barn — private party" is non-public (the is_private rule: the whole word)', H.isNonPublicDiscoveryRow({ venue_name: 'The Barn — private party' }) === true)
  t('a real venue with "Private booking" in its notes is non-public', H.isNonPublicDiscoveryRow({ venue_name: 'Village Hall', event_notes: 'Private booking' }) === true)
  for (const v of ['Red Lion', 'Party In The Park', 'Privateer Brewery', 'Closed Shop Cafe', 'TBC Black Dog Music Project']) t(`"${v}" is public`, H.isNonPublicDiscoveryRow({ venue_name: v }) === false)
  t('visibility for a non-public GB row: hidden, off both sites', JSON.stringify(H.discoveryRowVisibility({ venue_name: 'Private Hire' }, 'GB')) === JSON.stringify({ visibility: 'hidden', show_on_vf: false, show_on_hg: false }))
  t('visibility for a named GB row: unchanged (public, on both sites)', JSON.stringify(H.discoveryRowVisibility({ venue_name: 'Red Lion' }, 'GB')) === JSON.stringify({ visibility: 'public', show_on_vf: true, show_on_hg: true }))
  t('visibility for a named US row: unchanged (public column, off both sites)', JSON.stringify(H.discoveryRowVisibility({ venue_name: 'Red Lion' }, 'US')) === JSON.stringify({ visibility: 'public', show_on_vf: false, show_on_hg: false }))

  // 2 ── the gate
  head('2 · the gate (every insert into discovery_events)')
  {
    const pg = db(); clearAll()
    pg.tables.discovery_events.length = 0
    await kit.quietAsync(() => GATE.admitDiscoveryEvents(pg, [
      { event_date: '2026-11-01', start_time: '17:00', end_time: '21:00', truck_name: 'Pizza Kitchen', venue_name: 'Red Lion', village: 'Cambridge', source: 'URL' },
      { event_date: '2026-11-02', start_time: null, end_time: null, truck_name: 'Pizza Kitchen', venue_name: 'Private Event', village: null, source: 'URL' },
      { event_date: '2026-11-03', start_time: null, end_time: null, truck_name: 'Pizza Kitchen', venue_name: 'Closed', village: null, source: 'URL' },
      { event_date: '2026-11-04', start_time: '12:00', end_time: '15:00', truck_name: 'Pizza Kitchen', venue_name: 'Village Hall', village: 'Newtown', event_notes: 'Private booking', source: 'URL' },
    ], { country: 'GB' }))
    const by = Object.fromEntries(pg.tables.discovery_events.map(r => [r.venue_name, r]))
    const flags = r => r && { visibility: r.visibility, show_on_vf: r.show_on_vf, show_on_hg: r.show_on_hg }
    t('four rows written', pg.tables.discovery_events.length === 4, pg.tables.discovery_events.map(r => r.venue_name))
    t('"Red Lion": public, on both sites, venue linked — as before', JSON.stringify(flags(by['Red Lion'])) === JSON.stringify({ visibility: 'public', show_on_vf: true, show_on_hg: true }) && by['Red Lion'].venue_id === 'v-redlion', flags(by['Red Lion']))
    for (const v of ['Private Event', 'Closed', 'Village Hall']) t(`"${v}": hidden, off both sites`, JSON.stringify(flags(by[v])) === JSON.stringify({ visibility: 'hidden', show_on_vf: false, show_on_hg: false }), flags(by[v]))
    const us = db(); clearAll(); us.tables.discovery_events.length = 0
    await kit.quietAsync(() => GATE.admitDiscoveryEvents(us, [{ event_date: '2026-11-01', start_time: '17:00', end_time: '21:00', truck_name: 'Pizza Kitchen', venue_name: 'Red Lion', village: 'Cambridge', source: 'URL' }], { country: 'US' }))
    t('a US row is written exactly as before (public column, off both sites)', JSON.stringify(flags(us.tables.discovery_events[0])) === JSON.stringify({ visibility: 'public', show_on_vf: false, show_on_hg: false }), flags(us.tables.discovery_events[0]))
  }

  // 3 ── the bridge (HatchGrab): the operator still gets the private event to approve
  head('3 · the email bridge: the operator\'s private truck event is still created')
  {
    const pg = db(); clearAll(); pg.tables.discovery_events.length = 0
    const req = new NextRequest('http://127.0.0.1:3999/api/inbound-schedule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      secret: 'harness-secret', hatchgrab_truck_id: 'test-truck', events: [
        { event_date: '20/10/2026', start_time: '', end_time: '', truck_name: 'Pizza Kitchen', venue_name: 'Private Hire', village: null, source: 'hg_scraper' },
        { event_date: '21/10/2026', start_time: '17:00', end_time: '21:00', truck_name: 'Pizza Kitchen', venue_name: 'Red Lion', village: 'Cambridge', source: 'hg_scraper' },
      ] }) })
    const res = await kit.quietAsync(() => INB.POST(req))
    const te = Object.fromEntries(pg.tables.truck_events.map(r => [r.venue_name, r]))
    const de = Object.fromEntries(pg.tables.discovery_events.map(r => [r.venue_name, r]))
    t('the bridge answered 200 and made both truck events', res.status === 200 && pg.tables.truck_events.length === 2, { status: res.status, n: pg.tables.truck_events.length })
    t('"Private Hire": a private truck event for the operator to approve, no venue guess (unchanged)', te['Private Hire'] && te['Private Hire'].is_private === true && te['Private Hire'].venue_id == null)
    t('"Red Lion": a normal truck event (unchanged)', te['Red Lion'] && te['Red Lion'].is_private === false && te['Red Lion'].venue_id === 'v-redlion')
    t('its discovery row is stored hidden; the named one public', de['Private Hire'] && de['Private Hire'].show_on_vf === false && de['Private Hire'].visibility === 'hidden' && de['Red Lion'] && de['Red Lion'].show_on_vf === true)
  }

  // 4 ── the feed, both hosts
  head('4 · the public feed, both hosts — rows STORED public before the fix')
  const feeds = {}
  for (const host of ['www.villagefoodie.co.uk', 'www.hatchgrab.com']) {
    const run = async F => {
      const pg = db(); clearAll()
      for (const e of pg.tables.discovery_events) {
        e.discovery_trucks = pg.tables.discovery_trucks.find(x => x.id === e.discovery_truck_id) || null
        e.venues = pg.tables.venues.find(x => x.id === e.venue_id) || null
      }
      const res = await kit.quietAsync(() => F.GET(new NextRequest(`http://${host}/api/discovery/events`, { headers: { host } })))
      return res.json()
    }
    const before = await run(FEED0), after = await run(FEED)
    feeds[host] = { before, after }
    const names = j => (j.events || []).map(e => e.venueName)
    if (host === 'www.hatchgrab.com') {
      // the HatchGrab host serves operator events only — scraped discovery rows never (the feed's `isHG ? []`)
      t(`${host}: serves no scraped row, before or after (unchanged)`, names(before).length === 0 && names(after).length === 0, { before: names(before), after: names(after) })
    } else {
      t(`${host}: BEFORE served all five, "Closed", "Private Hire" and the private-notes row among them`, ['Red Lion', 'Closed', 'Private Hire', 'Village Hall', 'Red Lion'].every((n, i) => names(before)[i] === n), names(before))
      t(`${host}: AFTER serves only the two Red Lion events`, JSON.stringify(names(after)) === JSON.stringify(['Red Lion', 'Red Lion']), names(after))
    }
    const strip = j => ({ ...j, events: (j.events || []).filter(e => !['Closed', 'Private Hire', 'Village Hall'].includes(e.venueName)) })
    t(`${host}: everything else in the feed is byte-identical (events, ids, trucks)`, JSON.stringify(strip(before)) === JSON.stringify(after))
  }

  // 5 ── the public truck page (the surface the live "Closed" rows reach)
  head('5 · the public truck page /trucks/pizza-kitchen (the scraped listing\'s page; its slug is its name)')
  for (const [label, key] of [['BEFORE', 'before'], ['AFTER', 'after']]) {
    const j = feeds['www.villagefoodie.co.uk'][key]
    globalThis.__tcData = { loading: false, loadError: null, refetch() {}, mapEvents: j.events, allTrucks: j.trucks }
    const html = kit.renderStatic(kit.h(TC.default, { slug: 'pizza-kitchen' }))
    delete globalThis.__tcData
    const shows = s => html.includes(s)
    if (label === 'BEFORE') t('BEFORE: the page lists "Closed" and "Private Hire" as events', shows('Closed') && shows('Private Hire'), html.length)
    else t('AFTER: the page lists the Red Lion events and no "Closed", "Private Hire" or private Village Hall', shows('Red Lion') && !shows('Closed') && !shows('Private Hire') && !shows('Village Hall'))
  }

  console.log(`\n${fail ? '✗' : '✓'} private-discovery-rows: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
