#!/usr/bin/env node
// scripts/generic-venue-guess.cjs — a generic event TITLE is never a venue, and a private scraped event gets no venue
// guess (16 October 2026, docs/private-event-approval-fix-report.md).
//
//   node scripts/generic-venue-guess.cjs
//
// ── 🔴 WHAT HAPPENED ─────────────────────────────────────────────────────────────────────────────────────────────
// Pizzeria Gusto's schedule lists private bookings as "Private Event" with no place. The email bridge
// (/api/inbound-schedule) passed that title to `findVenue` as the venue name, which matched it EXACTLY to a junk venue
// row called "Private Event" (created 22 May 2026 at 55.378, −3.436 — the centre of the UK), stamped
// venue_match_confidence 'low', and Manage then showed "📍 We guessed this location" on three private events.
// This runs the REAL modules (lib/venue-matcher, lib/discovery-gate, the bridge route) on the in-memory database
// (scripts/_fake-pg.cjs) — fixtures only, Pizza Kitchen-style rows, nothing live — and proves:
//   1. the generic-name list: "Private Event", "Private party", "Private hire", "Private booking", "Closed", "TBC", "TBA"
//      … are generic; "Party In The Park", "TBC Black Dog Music Project", "Red Lion" are not;
//   2. `findVenue` never matches a generic title, even when a venue row of that exact name exists, for any type;
//      it still matches a real name (and "Party In The Park") exactly as before;
//   3. the discovery gate never CREATES a venue from a generic title;
//   4. the bridge: a scraped PRIVATE event ("Private Event") is inserted with no venue, no coordinates, no
//      confidence; a NON-private generic title ("TBC") gets no venue either; a standard event at a real venue is
//      matched exactly as before (venue, coordinates, postcode, confidence);
//   5. scripts/run-scraper.js and lib/venue-matcher.ts read the ONE list (lib/generic-venue-names.json).
const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'generic-venue-guess' })
const { REPO } = kit
const { makeFakePg, KEYS_BOTH, COUNTRY_DEFAULTS } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
process.env.INBOUND_SCHEDULE_SECRET = 'harness-secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
process.env.SUPABASE_URL = 'http://127.0.0.1:9'
process.env.TZ = 'Europe/London'
const STUBS = {
  '@/lib/email': `export async function sendConfirmationEmail(m) { (globalThis.__emails = globalThis.__emails || []).push({ to: m.to, subject: m.subject }) ; return { ok: true } }`,
  '@/lib/auth/admin': `export async function verifyAdmin() { return true }`,
}

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${JSON.stringify(detail).slice(0, 400)}` : ''}`) } }

const v = (id, name, village, lat, lng, postcode) => ({ id, name, village, latitude: lat, longitude: lng, postcode, country: 'GB', phone: null, website: null, photo_url: null })
const VENUES = [
  v('v-junk', 'Private Event', null, 55.378051, -3.435973, null),          // the live junk row's shape
  v('v-party', 'Private Party', 'Cambridge', 52.2053, 0.1218, 'CB2 1TN'),
  v('v-tbc', 'TBC', null, 52.0, 0.5, null),
  v('v-redlion', 'Red Lion', 'Cambridge', 52.2053, 0.1218, 'CB2 1AA'),
  v('v-park', 'Party In The Park', 'Clare Castle Country Park', 52.0759, 0.5819, null),
]
function world() {
  return {
    venues: VENUES.map(x => ({ ...x })),
    discovery_trucks: [{ id: 'dt-kitchen', name: 'Pizza Kitchen', aliases: [], country: 'GB', show_on_vf: true, show_on_hg: true, excluded: false, hatchgrab_truck_id: 'test-truck' }],
    discovery_events: [],
    trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', contact_email: null, dashboard_token: 'tok', timezone: 'Europe/London', country: 'GB', scraper_preference: 'auto', active: true }],
    truck_events: [], truck_vans: [], rejected_event_signatures: [], discovery_exclusion_terms: [],
    country_settings: [snake(SEEDS.gbFromSeed())],
  }
}

;(async () => {
  kit.setNow('2026-10-09T14:20:00.000Z')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const clear = `\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`
  const VM = await kit.bundle('gvg-vm', `export * from '@/lib/venue-matcher'`)
  const GATE = await kit.bundle('gvg-gate', `export * from '@/lib/discovery-gate'` + clear, { stubs: STUBS })
  const INB = await kit.bundle('gvg-inbound', `export { POST } from '@/app/api/inbound-schedule/route'` + clear, { stubs: STUBS })

  // 1 ── the list
  console.log('\n── 1 · generic titles')
  for (const n of ['Private Event', 'private event', 'PRIVATE EVENT', 'Private party', 'Private Hire', 'Private booking', 'Private function', 'Closed', 'TBC', 'TBA', 'T.B.C.', 'Event'])
    t(`"${n}" is generic`, VM.isGenericVenueName(n) === true)
  for (const n of ['Party In The Park', 'TBC Black Dog Music Project', 'Red Lion', 'Privateer Brewery', 'Closed Shop Cafe', 'The Private Bar'])
    t(`"${n}" is not generic`, VM.isGenericVenueName(n) === false)

  // 2 ── findVenue
  console.log('\n── 2 · findVenue never matches a generic title, and still matches real names')
  for (const [name, village] of [['Private Event', null], ['Private Event', 'Cambridge'], ['Private Party', 'Cambridge'], ['TBC', null], ['Private hire', null]]) {
    const m = VM.findVenue(name, village, VENUES, 'GB')
    t(`findVenue("${name}", ${village ?? 'no village'}) → no venue, confidence none`, m.venue === null && m.confidence === 'none', m)
  }
  const red = VM.findVenue('Red Lion', 'Cambridge', VENUES, 'GB')
  t('findVenue("Red Lion", Cambridge) → Red Lion, high (unchanged)', red.venue?.id === 'v-redlion' && red.confidence === 'high', red)
  const park = VM.findVenue('Party In The Park', 'Clare Castle Country Park', VENUES, 'GB')
  t('findVenue("Party In The Park") still matches (a real title that only starts with a generic word)', park.venue?.id === 'v-park', park)

  // 3 ── the discovery gate never creates a venue from a generic title
  console.log('\n── 3 · the discovery gate creates no venue for a generic title')
  {
    const pg = makeFakePg(world(), { keys: KEYS_BOTH, defaults: COUNTRY_DEFAULTS }); globalThis.__harnessDb = pg
    if (GATE.clearCountrySettingsCache) GATE.clearCountrySettingsCache()
    const res = await kit.quietAsync(() => GATE.admitDiscoveryEvents(pg, [
      { event_date: '2026-10-20', start_time: null, end_time: null, truck_name: 'Pizza Kitchen', venue_name: 'Private Event', village: 'Newtown', source: 'URL' },
      { event_date: '2026-10-21', start_time: null, end_time: null, truck_name: 'Pizza Kitchen', venue_name: 'TBC', village: 'Newtown', source: 'URL' },
      { event_date: '2026-10-22', start_time: '17:00', end_time: '21:00', truck_name: 'Pizza Kitchen', venue_name: 'Village Green', village: 'Newtown', source: 'URL' },
    ], { country: 'GB' }))
    const created = pg.tables.venues.filter(x => !VENUES.some(o => o.id === x.id)).map(x => x.name)
    t('no venue row named "Private Event" or "TBC" is created; "Village Green" still is', !created.includes('Private Event') && !created.includes('TBC') && created.includes('Village Green'), { created, res: res && res.outcomes ? res.outcomes.map(o => o.venue) : res })
  }

  // 4 ── the bridge
  console.log('\n── 4 · the bridge: no venue guess for a private event or a generic title; real venues unchanged')
  {
    const pg = makeFakePg(world(), { keys: KEYS_BOTH, defaults: COUNTRY_DEFAULTS }); globalThis.__harnessDb = pg; globalThis.__emails = []
    if (INB.clearCountrySettingsCache) INB.clearCountrySettingsCache()
    const req = new NextRequest('http://127.0.0.1:3999/api/inbound-schedule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      secret: 'harness-secret', hatchgrab_truck_id: 'test-truck', events: [
        { event_date: '16/10/2026', start_time: '', end_time: '', truck_name: 'Pizza Kitchen', venue_name: 'Private Event', village: null, source: 'hg_scraper' },
        { event_date: '17/10/2026', start_time: '', end_time: '', truck_name: 'Pizza Kitchen', venue_name: 'TBC', village: null, source: 'hg_scraper' },
        { event_date: '18/10/2026', start_time: '17:00', end_time: '21:00', truck_name: 'Pizza Kitchen', venue_name: 'Red Lion', village: 'Cambridge', source: 'hg_scraper' },
      ] }) })
    const res = await kit.quietAsync(() => INB.POST(req))
    const body = await res.json()
    const rows = Object.fromEntries(pg.tables.truck_events.map(r => [r.venue_name, r]))
    const pick = r => r && { venue_id: r.venue_id, venue_id_source: r.venue_id_source, conf: r.venue_match_confidence, lat: r.latitude, lng: r.longitude, postcode: r.postcode, is_private: r.is_private }
    t('the bridge answered 200 and bridged three events', res.status === 200 && pg.tables.truck_events.length === 3, { status: res.status, body, n: pg.tables.truck_events.length })
    const p = rows['Private Event']
    t('"Private Event" (private): is_private, no venue, no coordinates, no confidence, no postcode', p && p.is_private === true && p.venue_id == null && p.venue_id_source == null
      && p.venue_match_confidence == null && p.latitude == null && p.longitude == null && p.postcode == null, pick(p))
    const g = rows['TBC']
    t('"TBC" (not private): no venue matched by its title', g && g.is_private === false && g.venue_id == null && g.latitude == null && g.venue_match_confidence == null, pick(g))
    const r = rows['Red Lion']
    t('"Red Lion" (standard): matched exactly as before — venue, coordinates, postcode, high', r && r.venue_id === 'v-redlion' && r.venue_id_source === 'scraper'
      && r.venue_match_confidence === 'high' && r.latitude === 52.2053 && r.postcode === 'CB2 1AA', pick(r))
  }

  // 5 ── one list
  console.log('\n── 5 · one list')
  const listFile = JSON.parse(fs.readFileSync(path.join(REPO, 'lib/generic-venue-names.json'), 'utf8'))
  t('the list file holds normalised names only', listFile.names.every(n => /^[a-z0-9]+$/.test(n)), listFile.names.filter(n => !/^[a-z0-9]+$/.test(n)))
  t('lib/venue-matcher.ts reads lib/generic-venue-names.json', /from '\.\/generic-venue-names\.json'/.test(fs.readFileSync(path.join(REPO, 'lib/venue-matcher.ts'), 'utf8')))
  const scraper = fs.readFileSync(path.join(REPO, 'scripts/run-scraper.js'), 'utf8')
  t('scripts/run-scraper.js reads the same file and refuses to write a generic venue', /generic-venue-names\.json/.test(scraper) && /GENERIC_VENUE_NAMES\.has\(/.test(scraper))

  console.log(`\n${fail ? '✗' : '✓'} generic-venue-guess: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
