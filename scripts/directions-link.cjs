// scripts/directions-link.cjs — THE DIRECTIONS LINK (docs/directions-link-fix-report.md), proved on FIXTURES (the in-memory
// database of scripts/_fake-pg.cjs; nothing live, nothing sent, no network).
//
// The event card's Google link read "https://www.google.com/maps/dir/?api=1&destination=$?q=<query>" — a stray "$?q="
// inside the destination. Checks:
//   1  THE URL — lib/maps-links.ts: coordinates when the event has them; otherwise the card's address text plus the
//      country's short name; the documented form https://www.google.com/maps/dir/?api=1&destination=<url-encoded>.
//      GB with and without coordinates, US, IE.
//   2  THE FEED — /api/discovery/events gives each event its country's short name (`countryName`): scraped rows the
//      Village Foodie country's, operator rows their truck's.
//   3  THE CARD — EventListCard renders that URL (no "$?q="), the Apple link unchanged, nothing else on the card moved.
//   4  NO OTHER COPY — no "$?q=" anywhere in app/, components/, lib/.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'directions-link' })
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`) } }
const head = s => console.log(`\n${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const G = 'https://www.google.com/maps/dir/?api=1&destination='

;(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'
  globalThis.fetch = async url => { throw new Error('unexpected fetch ' + url) }
  kit.setNow('2026-10-21T10:00:00Z'); kit.setDeviceTz('Europe/London')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the URL (lib/maps-links.ts)')
  const L = await kit.bundle('dl-lib', "export * from '@/lib/maps-links'")
  const cases = [
    ['GB, with coordinates (The Bell, Castle Hedingham)', { lat: 51.99312, lng: 0.60118, query: 'The Bell - Castle Hedingham, CO9 3EJ', countryName: 'UK' }, '51.99312,0.60118'],
    ['GB, no coordinates', { query: 'Red Lion - Wickhambrook, CB8 8PD', countryName: 'UK' }, 'Red Lion - Wickhambrook, CB8 8PD, UK'],
    ['US, no coordinates (Pier A Park)', { query: 'Pier A Park - Hoboken, 07030', countryName: 'US' }, 'Pier A Park - Hoboken, 07030, US'],
    ['US, with coordinates', { lat: 40.7365, lng: -74.027, query: 'Pier A Park - Hoboken, 07030', countryName: 'US' }, '40.7365,-74.027'],
    ["IE, no coordinates (People's Park, Limerick)", { query: "People's Park - Limerick, V94 X2Y3", countryName: 'Ireland' }, "People's Park - Limerick, V94 X2Y3, Ireland"],
    ['no country known: the address as today', { query: 'Red Lion - Wickhambrook, CB8 8PD' }, 'Red Lion - Wickhambrook, CB8 8PD'],
    ['no address and no coordinates: the old fallback, never the bare country', { query: '', countryName: 'UK' }, 'Event Location'],
    ['0,0 is a missing coordinate, not a place', { lat: 0, lng: 0, query: 'The Green - Ousden', countryName: 'UK' }, 'The Green - Ousden, UK'],
  ]
  for (const [name, input, dest] of cases) {
    const url = L.googleDirectionsUrl(input)
    t(`${name} → destination "${dest}"`, url === G + encodeURIComponent(dest) && !url.includes('$') && new URL(url).searchParams.get('destination') === dest
      && new URL(url).searchParams.get('api') === '1' && new URL(url).pathname === '/maps/dir/', url)
  }

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the feed gives each event its country\'s short name')
  const IE_ROW = { ...SEEDS.gbFromSeed(), countryCode: 'IE', name: 'Ireland', shortName: 'Ireland', currency: 'EUR', locale: 'en-IE', enabled: false }
  const CS = [snake(SEEDS.gbFromSeed()), snake(SEEDS.usFromSeed()), snake(IE_ROW)]
  const FEED = await kit.bundle('dl-feed', "export { GET } from '@/app/api/discovery/events/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'")
  const truck = (id, name, slug, cc) => ({ id, name, slug, country: cc, timezone: cc === 'US' ? 'America/New_York' : cc === 'IE' ? 'Europe/Dublin' : null, active: true, excluded: false,
    show_on_vf: true, show_on_hg: true, order_link_vf: false, order_link_hg: true, cuisine_type: 'Pizza', logo_storage_path: null, cover_image_path: null,
    contact_phone: null, website: null, social_instagram: null, social_facebook: null, phone_is_whatsapp: false })
  const T = { gb: truck('t-gb', 'Fenland Fryer', 'fenland-fryer', 'GB'), us: truck('t-us', 'Hoboken Slice', 'hoboken-slice', 'US'), ie: truck('t-ie', 'Limerick Pizza', 'limerick-pizza', 'IE') }
  const ev = (id, tr, venue, town, postcode, more = {}) => ({ id, truck_id: tr.id, event_date: '2026-10-25', start_time: '11:30:00', end_time: '20:00:00', venue_name: venue, town, postcode,
    latitude: null, longitude: null, notes: null, status: 'confirmed', is_private: false, venue_id: null, truck_place_id: null, ...more, trucks: tr })
  const DT = { id: 'dt-red', name: 'Red Lion Wood Fired', aliases: [], country: 'GB', show_on_vf: true, show_on_hg: true, excluded: false, exclude_reason: null, cuisine: 'Pizza',
    phone: null, mobile: null, order_url: null, accepted_methods: null, notes: null, website: null, menu_url: null, logo_url: null, photo_url: null, hatchgrab_truck_id: null }
  const VENUE = { id: 'v-red', name: 'Red Lion', village: 'Wickhambrook', postcode: 'CB8 8PD', latitude: 52.18, longitude: 0.55, phone: null, website: null, photo_url: null }
  const world = () => ({
    trucks: Object.values(T),
    truck_events: [
      ev('ev-gb', T.gb, 'The Green', 'Wickhambrook', 'CB8 8XX', { latitude: 52.1801, longitude: 0.5512 }),
      ev('ev-us', T.us, 'Pier A Park', 'Hoboken', '07030'),
      ev('ev-ie', T.ie, "People's Park", 'Limerick', 'V94 X2Y3'),
    ],
    discovery_trucks: [DT],
    discovery_events: [{ id: 'de-red', event_date: '2026-10-26', start_time: '12:00', end_time: '14:00', truck_name: DT.name, venue_name: 'Red Lion', village: 'Wickhambrook', event_notes: null,
      discovery_truck_id: DT.id, venue_id: VENUE.id, show_on_vf: true, show_on_hg: true, superseded_by: null, country: 'GB', discovery_trucks: DT, venues: VENUE }],
    venues: [VENUE], country_settings: CS,
  })
  globalThis.__harnessDb = makeFakePg(world()); FEED.clearCountrySettingsCache?.()
  const feed = async host => (await kit.quietAsync(() => FEED.GET(new NextRequest(`https://${host}/api/discovery/events`, { headers: { host } })))).json()
  const hg = await feed('www.hatchgrab.com'), vf = await feed('www.villagefoodie.co.uk')
  const byVenue = (j, v) => (j.events || []).find(e => e.venueName === v)
  t('HatchGrab feed (operator events): GB "UK", US "US", IE "Ireland"',
    byVenue(hg, 'The Green')?.countryName === 'UK' && byVenue(hg, 'Pier A Park')?.countryName === 'US' && byVenue(hg, "People's Park")?.countryName === 'Ireland',
    (hg.events || []).map(e => [e.venueName, e.countryName]))
  t('Village Foodie feed: UK only (its own rule) — the operator event and the scraped row both "UK"',
    byVenue(vf, 'The Green')?.countryName === 'UK' && byVenue(vf, 'Red Lion')?.countryName === 'UK' && vf.events.every(e => e.countryName === 'UK')
    && !byVenue(vf, 'Pier A Park') && !byVenue(vf, "People's Park"), (vf.events || []).map(e => [e.venueName, e.countryName]))
  t('coordinates still come through as numbers (the link\'s first choice)', byVenue(hg, 'The Green')?.venueLat === 52.1801 && byVenue(vf, 'Red Lion')?.venueLong === 0.55)
  globalThis.__harnessDb = makeFakePg({ ...world(), country_settings: [] }); FEED.clearCountrySettingsCache?.()
  const noRows = await feed('www.hatchgrab.com')
  t('no readable country rows: the feed still answers and simply leaves `countryName` out', (noRows.events || []).length > 0 && noRows.events.every(e => !('countryName' in e)))

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the card renders it')
  const STUBS = { 'posthog-js/react': 'export const usePostHog = () => null' }
  const CARD = 'components/EventListCard.tsx'
  const C = await kit.bundle('dl-card', `export { default } from '@/${CARD.replace(/\.tsx$/, '')}'`, { stubs: STUBS })
  const C0 = await kit.bundle('dl-card-before', `export { default } from '@/${CARD.replace(/\.tsx$/, '')}'`, { stubs: STUBS, patches: [
    { file: CARD, from: "import { googleDirectionsUrl } from '@/lib/maps-links'\n", to: '' },
    { file: CARD, from: /: googleDirectionsUrl\(\{ lat: ev\.venueLat, lng: ev\.venueLong, query: addressQuery, countryName: ev\.countryName \}\);/, to: ': `https://www.google.com/maps/dir/?api=1&destination=$?q=${safeQuery}`;' },
  ] })
  const render = (M, events) => kit.renderStatic(kit.h(M.default, { events, userLocation: null }))
  const hrefs = html => [...String(html).matchAll(/href="([^"]*maps[^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'"))
  for (const [name, events, dest] of [
    ['GB with coordinates', [byVenue(hg, 'The Green')], '52.1801,0.5512'],
    ['GB scraped row (venue coordinates)', [byVenue(vf, 'Red Lion')], '52.18,0.55'],
    ['US, no coordinates', [byVenue(hg, 'Pier A Park')], 'Pier A Park - Hoboken, 07030, US'],
    ['IE, no coordinates', [byVenue(hg, "People's Park")], "People's Park - Limerick, V94 X2Y3, Ireland"],
  ]) {
    const now = render(C, events), before = render(C0, events)
    const h = hrefs(now)
    t(`${name}: the Directions link is ${G}${encodeURIComponent(dest)}`, h.length === 1 && h[0] === G + encodeURIComponent(dest), h)
    t(`${name}: the old link had the stray "$?q="; nothing else on the card changed`, hrefs(before)[0]?.includes('destination=$?q=')
      && now.replace(/href="https:\/\/www\.google\.com\/maps\/dir\/[^"]*"/, 'HREF') === before.replace(/href="https:\/\/www\.google\.com\/maps\/dir\/[^"]*"/, 'HREF'))
  }
  const src = read(CARD)
  t('the Apple link is unchanged (maps.apple.com/?daddr=… with the same address text)', src.includes('`http://maps.apple.com/?daddr=${safeQuery}&dirflg=d`'))

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · no other copy of the malformed link')
  const files = []
  const walk = d => { for (const f of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
    if (f.name.startsWith('.') || f.name === 'node_modules') continue
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p); else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(f.name)) files.push(p)
  } }
  for (const d of ['app', 'components', 'lib', 'hooks']) walk(d)
  const bad = files.filter(f => /destination=\$\?q=|maps\/dir\/[^`'"]*\$\?/.test(read(f)))
  t(`no "destination=$?q=" in ${files.length} source files`, bad.length === 0, bad)
  const google = files.filter(f => read(f).includes('google.com/maps/dir'))
  t('the only Google directions builder is lib/maps-links.ts', google.length === 1 && google[0] === path.join('lib', 'maps-links.ts'), google)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
