// scripts/address-formats-2.cjs — ADDRESS FORMATS, STAGE 2 (docs/address-formats-2-report.md): entry forms, geocoding,
// Places, the AI prompts and event conflicts read the address config (lib/address-formats.ts).
//
// LOCALHOST ONLY. Nothing reaches a database or the network: fetch is a recorder, the routes read the in-memory database
// of scripts/_fake-pg.cjs, and the Manage renders are the language-phase-1d kit's. Checks (in _address-formats-2-after.cjs):
//   1  THE CONFIG — the entry flags, the examples and the AI slots of every format; GB/US entry flags all off.
//   2  GB AND US BYTE-IDENTICAL — the importer and screenshot prompts, the geocode query, the Places requests and stored
//      details, the trade-area values, the conflict results and the Places editor, against the snapshot of the code
//      BEFORE this stage (scripts/fixtures/address-formats-2-before.json, written by `--capture` before any edit).
//   3  IE / AU / NZ / CA — the forms (labels, required marks, the region dropdown, the Eircode check, "Customers see"),
//      "NSW" through save and display, "d02x963" → "D02 X963", an AU Places result stores the state, the prompts carry
//      each format's rules, and the conflicts follow `identifiesPremises`.
//   4  THE WRITE PATHS AND COLUMNS — suburb and the places region written in their own updates (safe before the SQL),
//      regions normalised with the truck's format, the base-region code validated against the format's list — and the
//      same writes against a database WITHOUT the new columns and WITH the old two-letter CHECK (before the SQL).
//   (The brief's demo item — 'per_dish' where a card alone is not allowed — was withdrawn by Dominic, 21 October 2026.)
//
// `node scripts/address-formats-2.cjs --capture` rewrites the BEFORE snapshot from the CURRENT code — run only on the
// code before this stage.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'address-formats-2' })
const CAPTURE = process.argv.includes('--capture')
const SNAP_FILE = path.join(REPO, 'scripts/fixtures/address-formats-2-before.json')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : ''}`) } }
const head = s => console.log(`\n${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const GB_TIME = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
const US_TIME = { timeZone: 'America/New_York', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
const TEXT = 'Sat 25th Oct The Crown Wickhambrook CB8 8PD 5pm-9pm\nSun 26th Oct Market Square Austin TX 78701 from 4pm'
// The legacy values are what the code before this stage was called with; the code after accepts them too (a format key
// or a legacy value, lib/address-formats.ts addressFormatKeyOf), so the same calls run on both.
const CTX = {
  gb: { truckName: 'Pizza Kitchen', baseTown: 'Wickhambrook', baseRegion: 'Suffolk', countryName: 'United Kingdom', countryCode: 'GB', addressFormat: 'postcode', recentTowns: ['Lavenham', 'Clare'] },
  us: { truckName: 'Hoboken Slice', baseTown: 'Hoboken', baseRegion: 'New Jersey', countryName: 'United States', countryCode: 'US', addressFormat: 'zip_state', recentTowns: ['Hoboken'] },
}
const SHOT_COUNTRY = { gb: { code: 'GB', name: 'United Kingdom', addressFormat: 'postcode', dateOrder: 'dmy' }, us: { code: 'US', name: 'United States', addressFormat: 'zip_state', dateOrder: 'mdy' } }
const GEO = {
  gb: { venueName: 'The Bell', town: 'Castle Hedingham', postcode: 'CO9 3EJ', country: 'UK' },
  gbNoCountry: { venueName: 'The Bell', town: 'Castle Hedingham', postcode: 'CO9 3EJ' },
  us: { venueName: 'Pier A Park', town: 'Hoboken', postcode: '07030', country: 'US' },
  usNoPostcode: { venueName: 'Pier A Park', town: 'Hoboken', country: 'US' },
}
const ev = (id, date, venue, postcode, start, end, status = 'confirmed') => ({ id, event_date: date, venue_name: venue, postcode, start_time: start, end_time: end, status, van_id: null })
const CONFLICTS = {
  // the candidate first, then the existing events
  sameVenueSameTime: [ev('c', '2026-10-25', 'The Bell', 'CO9 3EJ', '17:00', '21:00', 'unconfirmed'), ev('x', '2026-10-25', 'The Bell', 'CO9 3EJ', '17:00', '21:00')],
  sameVenueOtherTime: [ev('c', '2026-10-25', 'The Bell', 'CO9 3EJ', '12:00', '14:00', 'unconfirmed'), ev('x', '2026-10-25', 'The Bell', 'CO9 3EJ', '17:00', '21:00')],
  samePostcodeOtherVenue: [ev('c', '2026-10-25', 'The Swan', 'CO9 3EJ', '12:00', '14:00', 'unconfirmed'), ev('x', '2026-10-25', 'The Bell', 'CO9 3EJ', '17:00', '21:00')],
  usSameZipOtherVenue: [ev('c', '2026-10-25', 'Pier A Park', '07030', '12:00', '14:00', 'unconfirmed'), ev('x', '2026-10-25', 'Hoboken Farmers Market', '07030', '17:00', '21:00')],
  usSameZipOtherVenueOverlap: [ev('c', '2026-10-25', 'Pier A Park', '07030', '17:00', '20:00', 'unconfirmed'), ev('x', '2026-10-25', 'Hoboken Farmers Market', '07030', '18:00', '21:00')],
  usSameVenue: [ev('c', '2026-10-25', 'Pier A Park', '07030', '17:00', '21:00', 'unconfirmed'), ev('x', '2026-10-25', 'Pier A Park', '07030', '17:00', '21:00')],
  overlapNoPostcode: [ev('c', '2026-10-25', 'Somewhere', null, '17:00', '20:00', 'unconfirmed'), ev('x', '2026-10-25', 'Elsewhere', null, '18:00', '21:00')],
}
const CONFLICT_FORMAT = { sameVenueSameTime: 'gb', sameVenueOtherTime: 'gb', samePostcodeOtherVenue: 'gb', usSameZipOtherVenue: 'us', usSameZipOtherVenueOverlap: 'us', usSameVenue: 'us', overlapNoPostcode: 'gb' }
// Google Places details answers — the components a UK town, a US city and an Australian suburb come back with.
const PLACE = {
  gb: { id: 'ChIJ-gb-wickhambrook-0001', displayName: { text: 'Wickhambrook' }, location: { latitude: 52.18, longitude: 0.55 },
    addressComponents: [{ longText: 'Wickhambrook', types: ['locality'] }, { longText: 'Suffolk', shortText: 'Suffolk', types: ['administrative_area_level_2'] }, { longText: 'England', shortText: 'England', types: ['administrative_area_level_1'] }] },
  us: { id: 'ChIJ-us-hoboken-00000001', displayName: { text: 'Hoboken' }, location: { latitude: 40.744, longitude: -74.0324 },
    addressComponents: [{ longText: 'Hoboken', types: ['locality'] }, { longText: 'Hudson County', shortText: 'Hudson County', types: ['administrative_area_level_2'] }, { longText: 'New Jersey', shortText: 'NJ', types: ['administrative_area_level_1'] }] },
  au: { id: 'ChIJ-au-bondibeach-00001', displayName: { text: 'Bondi Beach' }, location: { latitude: -33.8915, longitude: 151.2767 },
    addressComponents: [{ longText: 'Bondi Beach', types: ['locality'] }, { longText: 'Waverley Council', shortText: 'Waverley', types: ['administrative_area_level_2'] }, { longText: 'New South Wales', shortText: 'NSW', types: ['administrative_area_level_1'] }] },
}
const TRADE = { base_place_name: 'Hoboken', base_place_id: 'ChIJ-us-hoboken-00000001', base_region: 'New Jersey', base_region_code: 'NJ', base_lat: 40.744, base_lng: -74.0324, timezone: 'America/New_York' }

async function snapshot() {
  const out = {}
  kit.setNow('2026-10-21T10:00:00Z')
  const X = await kit.bundle('af2-extract', "export * from '@/lib/schedule-extract'\nexport * as Shot from '@/lib/admin/screenshot-events'\nexport * as EC from '@/lib/event-conflicts'\nexport * as Pl from '@/lib/places'\nexport * as TA from '@/lib/trade-area'")
  out['prompt.import.none'] = X.buildScheduleExtractionPrompt(TEXT, GB_TIME)
  out['prompt.import.gb'] = X.buildScheduleExtractionPrompt(TEXT, GB_TIME, CTX.gb)
  out['prompt.import.us'] = X.buildScheduleExtractionPrompt(TEXT, US_TIME, CTX.us)
  out['prompt.import.gbNoText'] = X.buildScheduleExtractionPrompt('', GB_TIME, CTX.gb)
  const now = new Date('2026-10-21T10:00:00Z')
  out['prompt.shot.none'] = X.Shot.buildScreenshotPrompt(now)
  out['prompt.shot.gb'] = X.Shot.buildScreenshotPrompt(now, SHOT_COUNTRY.gb)
  out['prompt.shot.us'] = X.Shot.buildScreenshotPrompt(now, SHOT_COUNTRY.us)
  for (const [k, list] of Object.entries(CONFLICTS)) out[`conflicts.${k}`] = JSON.stringify(X.EC.detectEventConflicts(list[0], list, CONFLICT_FORMAT[k]))
  // Places: the request the town box makes, and what a picked town stores — fetch is a recorder.
  const realFetch = globalThis.fetch
  process.env.GOOGLE_MAPS_API_KEY = 'address-formats-2-recorder'
  try {
    for (const cc of ['gb', 'us']) {
      const calls = []
      globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body ?? null }); return new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: PLACE[cc].id, structuredFormat: { mainText: { text: PLACE[cc].displayName.text }, secondaryText: { text: 'x' } } } }] }), { status: 200 }) }
      out[`places.suggest.${cc}`] = JSON.stringify({ result: await X.Pl.suggestTowns('Hob', cc.toUpperCase(), 'sess-1234567890'), calls })
      globalThis.fetch = async () => new Response(JSON.stringify(PLACE[cc]), { status: 200 })
      out[`places.details.${cc}`] = JSON.stringify(await X.Pl.townDetails(PLACE[cc].id, 'sess-1234567890', cc === 'us' ? 'zip_state' : 'postcode'))
    }
  } finally { globalThis.fetch = realFetch; delete process.env.GOOGLE_MAPS_API_KEY }
  for (const [cc, af] of [['gb', 'postcode'], ['us', 'zip_state']]) {
    const facts = { countryCode: cc.toUpperCase(), name: cc === 'us' ? 'United States' : 'United Kingdom', enabled: true, timezones: [TRADE.timezone, 'Europe/London'], defaultTimezone: cc === 'us' ? TRADE.timezone : 'Europe/London', addressFormat: af }
    out[`trade.${cc}`] = JSON.stringify(X.TA.checkTradeArea({ ...TRADE, timezone: facts.defaultTimezone }, facts))
    out[`trade.${cc}.badCode`] = JSON.stringify(X.TA.checkTradeArea({ ...TRADE, base_region_code: 'nj', timezone: facts.defaultTimezone }, facts))
  }
  // The places editor, rendered for a GB and a US truck (the language-phase-1d kit's providers).
  const LP = require('./_lp1d-fixtures.cjs'), ctx = LP.context(kit, REPO)
  const PD = await kit.bundle('af2-places', ["export { PlaceDetail } from '@/components/manage/SchedulePlaces'", LP.PROVIDERS].join('\n'))
  const place = { id: 'p1', name: 'The Bell, Castle Hedingham', short_name: 'The Bell', address: '12 High St', area: 'Castle Hedingham', postcode: 'CO9 3EJ', is_favourite: false, is_hidden: false }
  for (const C of [ctx.GB, ctx.US]) out[`placeDetail.${C.cc}`] = ctx.html({}, ctx.inManage(PD, C, kit.h(PD.PlaceDetail, { place, api: async () => ({}), showToast: () => {}, onChanged: () => {} })))
  // The geocoder: the prompt it sends (Gemini is a recorder).
  const G = await kit.bundle('af2-geocode', "export { POST } from '@/app/api/manage/geocode/route'")
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  for (const [k, body] of Object.entries(GEO)) {
    const sent = []
    globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body).contents[0].parts[0].text); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"lat":52.1,"lng":0.5,"confidence":"high"}' }] } }] }), { status: 200 }) }
    try {
      const res = await G.POST(new NextRequest('http://127.0.0.1/api/manage/geocode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, ...(CAPTURE ? {} : { addressFormat: k.startsWith('us') ? 'us' : 'gb' }) }) }))
      out[`geocode.${k}`] = JSON.stringify({ prompt: sent[0] ?? null, answer: await res.json() })
    } finally { globalThis.fetch = realFetch }
  }
  return out
}

;(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'
  kit.setDeviceTz('Europe/London')
  if (CAPTURE) {
    const snap = await snapshot()
    fs.mkdirSync(path.dirname(SNAP_FILE), { recursive: true })
    fs.writeFileSync(SNAP_FILE, JSON.stringify({ captured: new Date().toISOString(), from: 'the code before address-formats-2 (21 October 2026)', outputs: snap }, null, 1) + '\n')
    console.log(`captured ${Object.keys(snap).length} outputs → ${path.relative(REPO, SNAP_FILE)}`)
    process.exit(0)
  }
  require('./_address-formats-2-after.cjs')({ kit, t, head, read, REPO, snapshot, SNAP_FILE, CTX, SHOT_COUNTRY, CONFLICTS, PLACE, GB_TIME, US_TIME, TEXT })
    .then(() => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) })
    .catch(e => { console.error(e); process.exit(1) })
})().catch(e => { console.error(e); process.exit(1) })
