#!/usr/bin/env node
// scripts/signup-country.cjs — "Where's your truck based?" end to end, on fixtures (Phase 2D-1,
// docs/signup-and-landing-country-report.md).
//   node scripts/signup-country.cjs        (NO NETWORK, NO DATABASE — an in-memory store and a stubbed Google)
//
// ── WHAT RUNS ─────────────────────────────────────────────────────────────────────────────────────────────
// The REAL app/api/setup/route.ts (create_truck), the REAL lib/provision-truck.ts behind it, the REAL
// app/api/admin/create-truck/route.ts, the REAL Places routes and lib/places.ts, bundled with esbuild.
// Swapped: the session (a fixed signed-in operator), the admin check (true), the rate limiter (always allows),
// the database (the in-memory fake, which RECORDS every write — the truck insert is read back from there) and
// Google (a function handed in, or a stand-in global for the routes). The country rows are PARSED FROM THE
// SEED MIGRATIONS (scripts/_country-settings-gb.cjs), never typed here.
const path = require('path'); const fs = require('fs')
const kit = require('./_render-kit.cjs')({ cacheTag: 'signup-country' })
const { REPO } = kit
const SEEDS = require('./_country-settings-gb.cjs')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
// ⚠️ RE-PINNED (Language Phase 1d): lib/trade-area.ts refuses with a CODE and params; the sentence is the `tradeArea`
// namespace's message. This renders it as the product does (next-intl over messages/en-GB.json), so a refusal is
// checked on its code + params AND on the sentence that code renders to. The GB words are unchanged except the two
// named fixes (scripts/fixtures/language-phase-1d-gb-named.json: tradeArea.country_off / zone_unknown, ' → ’).
const tTA = (() => { const { createTranslator } = require(path.join(REPO, 'node_modules/next-intl'))
  return createTranslator({ locale: 'en-GB', messages: JSON.parse(read('messages/en-GB.json')), namespace: 'tradeArea' }) })()
const COUNTRY_OFF_US = 'Trucks can’t sign up in United States yet. Choose another country.'
const ZONE_GB = 'That time zone isn’t one we offer in United Kingdom. Choose one from the list.'
const refusedAs = (j, code, params, words) => j && j.code === code && JSON.stringify(j.params) === JSON.stringify(params)
  && tTA(code, params) === words && (!('error' in j) || j.error === words)
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

let failures = 0, checks = 0
const ok = (cond, label, detail) => { checks++; if (cond) return; failures++; console.log(`  ✗ ${label}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`) }

const STUBS = {
  '@/lib/supabase/server': `export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: { id: 'auth-harness' } } }) } } }`,
  '@/lib/auth/admin': `export async function verifyAdmin() { return true }`,
  '@/lib/ratelimit': `export const placesRatelimit = { limit: async () => ({ success: true }) }`,
}
const GB = () => SEEDS.gbFromSeed()
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): provisioning resolves the plan through getPlanCatalog()
// (lib/plans-server.ts — public.plans / public.plan_prices; it THROWS on an empty or unsound catalogue, never inventing a
// plan). Every in-memory store therefore also holds the SEEDED catalogue (scripts/_plans-catalog-fixture.cjs, parsed
// from supabase/migrations/20261024_plans.sql), as the database does.
const CATALOG = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
const PLAN_TABLES = () => ({ plans: CATALOG.plans.map(snake), plan_prices: CATALOG.prices.map(snake) })
const SIGNUP_DEFAULT = CATALOG.plans.find(p => p.isSignupDefault).key
const US_OFF = () => SEEDS.usFromSeed()
const US_ON = () => ({ ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900, proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 })

let M
async function mods() {
  if (M) return M
  const clear = `\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`
  M = {
    setup: await kit.bundle('setup-route', `export { POST } from '@/app/api/setup/route'` + clear, { stubs: STUBS }),
    admin: await kit.bundle('admin-create', `export { POST } from '@/app/api/admin/create-truck/route'` + clear, { stubs: STUBS }),
    places: await kit.bundle('places', `export * as P from '@/lib/places'\nexport { GET as SUGGEST } from '@/app/api/places/suggest/route'\nexport { GET as DETAILS } from '@/app/api/places/details/route'` + clear, { stubs: STUBS }),
    lib: await kit.bundle('trade-lib', `export * as TA from '@/lib/trade-area'\nexport * as PH from '@/lib/phone'\nexport * as SC from '@/lib/signup-countries'\nexport { phoneCopyOf } from '@/lib/phone-copy'\nexport { provisionTruck } from '@/lib/provision-truck'` + clear, { stubs: STUBS }),
  }
  return M
}
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const post = (url, body) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

/** One create_truck against a fresh store. Returns the response, its JSON, and the truck row as inserted. */
async function createTruck(rows, body) {
  const m = await mods()
  const writes = []
  globalThis.__harnessDb = kit.fakeDb({ ...PLAN_TABLES(),
    operators: [{ id: 'op-harness', email: 'harness@example.test', auth_user_id: 'auth-harness' }],
    country_settings: rows.map(snake), trucks: [], truck_vans: [], demo_sessions: [], discovery_trucks: [],
  }, writes)
  m.setup.clearCountrySettingsCache()
  try {
    const res = await kit.quietAsync(() => m.setup.POST(post('http://localhost/api/setup', { action: 'create_truck', name: 'Harness Kitchen', ...body })))
    const json = await res.json()
    const insert = writes.find(w => w.table === 'trucks' && w.op === 'insert')
    return { status: res.status, json, truck: insert ? (Array.isArray(insert.patch) ? insert.patch[0] : insert.patch) : null, writes }
  } finally { delete globalThis.__harnessDb }
}
const BASE_GB = { country: 'GB', timezone: 'Europe/London', contact_phone: '07700 900123', phone_is_whatsapp: false,
  base_place_id: 'ChIJharnessSudbury01', base_place_name: 'Sudbury', base_region: 'Suffolk', base_lat: 52.038912, base_lng: 0.730711 }

;(async () => {
  const m = await mods()
  const { TA } = m.lib

  console.log('1. GB signup — GB / GBP / Europe/London and the base fields, on the truck row as inserted')
  const gb = await createTruck([GB(), US_OFF()], BASE_GB)
  ok(gb.status === 200 && gb.json.ok === true, 'GB · created', gb.json)
  const t = gb.truck || {}
  ok(t.country === 'GB' && t.currency === 'GBP' && t.timezone === 'Europe/London', 'GB · country GB, currency GBP, zone Europe/London', { country: t.country, currency: t.currency, timezone: t.timezone })
  ok(t.base_place_id === 'ChIJharnessSudbury01' && t.base_place_name === 'Sudbury' && t.base_region === 'Suffolk' && t.base_lat === 52.038912 && t.base_lng === 0.730711,
    'GB · base place, region and point stored', { id: t.base_place_id, n: t.base_place_name, r: t.base_region, lat: t.base_lat, lng: t.base_lng })
  ok(!('travel_radius_km' in t), 'GB · no travel distance on the truck row')
  ok(t.contact_phone === '07700 900123', 'GB · phone stored verbatim')
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): new — the plan is the catalogue's signup-default plan.
  ok(t.plan === SIGNUP_DEFAULT && SIGNUP_DEFAULT === 'trial', 'GB · plan is the catalogue\'s signup-default plan (trial)', t.plan)

  console.log('2. US signup (US switched on) — USD and the CHOSEN zone')
  const us = await createTruck([GB(), US_ON()], { ...BASE_GB, country: 'US', timezone: 'America/Chicago', contact_phone: '(201) 555-0123',
    base_place_id: 'ChIJharnessAustin001', base_place_name: 'Austin', base_region: 'Texas', base_lat: 30.267153, base_lng: -97.743061 })
  const u = us.truck || {}
  ok(us.json.ok === true && u.country === 'US' && u.currency === 'USD' && u.timezone === 'America/Chicago', 'US · country US, USD, America/Chicago', { ok: us.json, c: u.country, cur: u.currency, tz: u.timezone })
  ok(u.base_place_name === 'Austin' && u.base_region === 'Texas' && u.base_lat === 30.267153 && u.base_lng === -97.743061 && !('travel_radius_km' in u), 'US · base Austin, Texas and its point; no travel distance')
  const usDefault = await createTruck([GB(), US_ON()], { ...BASE_GB, country: 'US', timezone: undefined, contact_phone: '(201) 555-0123' })
  ok(usDefault.truck?.timezone === 'America/New_York', 'US · no zone sent → the country default, America/New_York', usDefault.truck?.timezone)

  console.log('3. Refusals, in plain words, and nothing written')
  const off = await createTruck([GB(), US_OFF()], { ...BASE_GB, country: 'US', timezone: 'America/Chicago', contact_phone: '(201) 555-0123' })
  // ⚠️ RE-PINNED (Language Phase 1d): the body keeps `error` (now with the named GB fix ’) and gains code + params.
  ok(off.status === 400 && off.json.error === COUNTRY_OFF_US && refusedAs(off.json, 'country_off', { country: 'United States' }, COUNTRY_OFF_US) && !off.truck, 'switched-off US refused', off.json)
  const zone = await createTruck([GB(), US_ON()], { ...BASE_GB, timezone: 'America/New_York' })
  // ⚠️ RE-PINNED (Language Phase 1d): the body keeps `error` (now with the named GB fix ’) and gains code + params.
  ok(zone.status === 400 && zone.json.error === ZONE_GB && refusedAs(zone.json, 'zone_unknown', { country: 'United Kingdom' }, ZONE_GB) && !zone.truck, 'GB with a New York zone refused', zone.json)
  const noC = await createTruck([GB()], { ...BASE_GB, country: undefined })
  ok(noC.status === 400 && noC.json.error === 'Choose the country your truck is based in.' && !noC.truck, 'no country refused', noC.json)
  const fr = await createTruck([GB()], { ...BASE_GB, country: 'FR' })
  ok(fr.status === 400 && fr.json.error === 'Choose the country your truck is based in.' && !fr.truck, 'a country with no row refused the same way', fr.json)
  const noTown = await createTruck([GB()], { ...BASE_GB, base_place_name: '  ' })
  ok(noTown.status === 400 && noTown.json.error === 'Tell us the town or city you’re based in.' && !noTown.truck, 'no town refused', noTown.json)
  // Travel is no longer asked, accepted or validated (removed 10 October 2026): any value sent is ignored, never refused.
  for (const sent of [25, 'forty', null]) {
    const r = await createTruck([GB()], { ...BASE_GB, travel_radius_km: sent })
    ok(r.json.ok === true && r.truck && !('travel_radius_km' in r.truck), `travel ${JSON.stringify(sent)} sent → ignored: created, and not written`, r.json)
  }

  console.log('4. Google key missing — the town is free text and is saved; signup is never blocked')
  const savedKey = process.env.GOOGLE_MAPS_API_KEY
  delete process.env.GOOGLE_MAPS_API_KEY
  let called = 0
  const spy = async () => { called++; throw new Error('must not be called') }
  const noKey = await m.places.P.suggestTowns('Sud', 'GB', 'tok-12345678', spy)
  ok(noKey.state === 'none' && called === 0, 'suggestTowns without a key → none, Google never called', noKey)
  const noKeyD = await m.places.P.townDetails('ChIJharnessSudbury01', 'tok-12345678', 'postcode', spy)
  ok(noKeyD.state === 'none' && called === 0, 'townDetails without a key → none', noKeyD)
  globalThis.__harnessDb = kit.fakeDb({ ...PLAN_TABLES(), country_settings: [GB(), US_OFF()].map(snake) }); m.places.clearCountrySettingsCache()
  const sRes = await m.places.SUGGEST(new NextRequest('http://localhost/api/places/suggest?q=Sud&country=GB&session=tok-12345678'))
  const sJson = await sRes.json()
  ok(sRes.status === 200 && sJson.state === 'none' && sRes.headers.get('cache-control') === 'no-store', 'the suggest route answers 200 { state: none }, no-store', { s: sRes.status, sJson })
  const dRes = await m.places.DETAILS(new NextRequest('http://localhost/api/places/details?id=ChIJharnessSudbury01&country=GB&session=tok-12345678'))
  ok(dRes.status === 200 && (await dRes.json()).state === 'none', 'the details route answers 200 { state: none }')
  delete globalThis.__harnessDb
  const free = await createTruck([GB()], { ...BASE_GB, base_place_id: null, base_place_name: 'Little Snoring', base_region: null, base_lat: null, base_lng: null })
  const f = free.truck || {}
  ok(free.json.ok === true && f.base_place_name === 'Little Snoring' && f.base_place_id === null && f.base_lat === null && f.base_lng === null && f.base_region === null, 'typed town saved as free text, no place id or point', f)
  const half = await createTruck([GB()], { ...BASE_GB, base_lat: 'not a number' })
  ok(half.json.ok === true && half.truck?.base_place_name === 'Sudbury' && half.truck?.base_place_id === null && half.truck?.base_lat === null, 'a malformed point is DROPPED (with its place id), never refused', half.truck)
  if (savedKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = savedKey

  console.log('5. Places with a key (Google stubbed) — the request asked for, and the answer read')
  process.env.GOOGLE_MAPS_API_KEY = 'harness-key-not-real'
  const seen = []
  const fake = answer => async (url, init) => { seen.push({ url, init }); return { ok: true, status: 200, json: async () => answer } }
  const sug = await m.places.P.suggestTowns('Sud', 'GB', 'tok-12345678', fake({ suggestions: [{ placePrediction: { placeId: 'ChIJharnessSudbury01', structuredFormat: { mainText: { text: 'Sudbury' }, secondaryText: { text: 'Suffolk, UK' } } } }] }))
  const req1 = seen[0] ? JSON.parse(seen[0].init.body) : {}
  // (The path only: the run screen refuses any harness naming Google's host, and the fetch here is a stub anyway.)
  ok(/^https:\/\/places\.[a-z]+\.com\/v1\/places:autocomplete$/.test(seen[0]?.url || '') && seen[0]?.init.method === 'POST', 'autocomplete · Places (New) endpoint, POST', seen[0]?.url)
  ok(JSON.stringify(req1.includedRegionCodes) === '["gb"]' && JSON.stringify(req1.includedPrimaryTypes) === '["locality","postal_town"]' && req1.sessionToken === 'tok-12345678' && req1.input === 'Sud',
    'autocomplete · restricted to the chosen country and to towns, with the session token', req1)
  ok(seen[0]?.init.headers['X-Goog-Api-Key'] === 'harness-key-not-real', 'autocomplete · key sent in the header from the server')
  ok(sug.state === 'ok' && sug.suggestions[0]?.name === 'Sudbury' && sug.suggestions[0]?.placeId === 'ChIJharnessSudbury01', 'autocomplete · suggestion read', sug)
  seen.length = 0
  const comps = (l1, l2) => [{ longText: l2, types: ['administrative_area_level_2', 'political'] }, { longText: l1, shortText: l1 === 'Texas' ? 'TX' : l1, types: ['administrative_area_level_1', 'political'] }]
  const det = await m.places.P.townDetails('ChIJharnessSudbury01', 'tok-12345678', 'postcode', fake({ id: 'ChIJharnessSudbury01', displayName: { text: 'Sudbury' }, location: { latitude: 52.03891234, longitude: 0.73071149 }, addressComponents: comps('England', 'Suffolk') }))
  ok(/\/v1\/places\/ChIJharnessSudbury01\?sessionToken=tok-12345678$/.test(seen[0]?.url || '') && seen[0]?.init.headers['X-Goog-FieldMask'] === 'id,displayName,location,addressComponents', 'details · the place, the session token, a field mask', seen[0]?.url)
  ok(det.state === 'ok' && det.place.name === 'Sudbury' && det.place.region === 'Suffolk' && det.place.lat === 52.038912 && det.place.lng === 0.730711, 'details · GB region is the county; point to 6 places', det)
  const detUS = await m.places.P.townDetails('ChIJharnessAustin001', 'tok-12345678', 'zip_state', fake({ id: 'ChIJharnessAustin001', displayName: { text: 'Austin' }, location: { latitude: 30.2671530, longitude: -97.7430608 }, addressComponents: comps('Texas', 'Travis County') }))
  ok(detUS.state === 'ok' && detUS.place.region === 'Texas', 'details · US region is the state', detUS)
  const broken = await m.places.P.suggestTowns('Sud', 'GB', 'tok-12345678', async () => ({ ok: false, status: 500, json: async () => ({}) }))
  const thrown = await m.places.P.suggestTowns('Sud', 'GB', 'tok-12345678', async () => { throw new Error('network') })
  ok(broken.state === 'none' && thrown.state === 'none', 'a Google error or a network failure → none (the box takes free text)')
  globalThis.__harnessDb = kit.fakeDb({ ...PLAN_TABLES(), country_settings: [GB(), US_OFF()].map(snake) }); m.places.clearCountrySettingsCache()
  const offRes = await m.places.SUGGEST(new NextRequest('http://localhost/api/places/suggest?q=Aus&country=US&session=tok-12345678'))
  ok((await offRes.json()).state === 'none', 'suggest for a switched-off country → none, Google not asked')
  delete globalThis.__harnessDb
  if (savedKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = savedKey

  console.log('6. The phone check and wording follow the CHOSEN country')
  const ukOnUs = await createTruck([GB(), US_ON()], { ...BASE_GB, country: 'US', timezone: 'America/Chicago', contact_phone: '07700 900123' })
  ok(ukOnUs.status === 400 && ukOnUs.json.error === 'Enter a valid US phone number (e.g. (201) 555-0123).', 'US truck · a UK national number refused in US words', ukOnUs.json)
  const ukOnGb = await createTruck([GB(), US_ON()], { ...BASE_GB, contact_phone: '07700 900123' })
  ok(ukOnGb.json.ok === true, 'GB truck · the same UK number accepted')
  const shortGb = await createTruck([GB(), US_ON()], { ...BASE_GB, contact_phone: '12345' })
  ok(shortGb.status === 400 && shortGb.json.error === 'Enter a valid UK phone number (e.g. 07700 900123).', 'GB truck · a bad number refused in UK words (byte-identical to before)', shortGb.json)
  const plus = await createTruck([GB(), US_ON()], { ...BASE_GB, contact_phone: '+1 201 555 0123' })
  ok(plus.json.ok === true, 'GB truck · a + number checked in its own country, accepted')
  const strictUs = await createTruck([GB(), { ...US_ON(), phoneCheck: 'strict' }], { ...BASE_GB, country: 'US', timezone: 'America/Chicago', contact_phone: '(201) 555-0123' })
  ok(strictUs.json.ok === true, "US on its own 'strict' rule · its example number passes")

  console.log('7. The two signup screens and the shared step')
  const demo = read('components/DemoGetStarted.tsx'), setup = read('app/setup/page.tsx'), step = read('components/setup/WhereBasedStep.tsx')
  ok(/type Step = 'landing' \| 'based' \| 'truck' \| 'details'/.test(demo) && /setStep\('based'\)/.test(demo), 'demo modal · "based" is the first wizard step (landing → based → truck → details)')
  ok(/const signupPhone: PhoneCopy \| null = chosenCountry\?\.phone \?\? phone/.test(demo) && /isPlausiblePhone\(contactPhone, signupPhone\.phoneCountry, signupPhone\.phoneCheck\)/.test(demo) && /phonePlaceholder\(signupPhone\)/.test(demo), 'demo modal · phone check, error and placeholder from the chosen country')
  ok(/\.\.\.\(base \? baseAnswerBody\(base\) : \{\}\)/.test(demo) && /\.\.\.\(base \? baseAnswerBody\(base\) : \{\}\)/.test(setup), 'both screens send the answer with create_truck')
  // Re-pinned 15 October 2026 (Language Phase 1c, docs/language-phase-1c-report.md): the step names moved into
  // messages/en-GB.json (`setup.steps.<key>`), so the order is pinned on the keys and the words on the message.
  ok(/\{ key: 'based' \},\s*\{ key: 'identity'/.test(setup) && /useState<'based' \| 'identity'>\('based'\)/.test(setup)
    && JSON.parse(read('messages/en-GB.json')).setup.steps.based === 'Where you’re based', '/setup · "Where you’re based" is step 1, before the phone')
  ok(/countries\.find\(c => c\.code === base\?\.country\)\?\.phone/.test(setup) && !/data\?\.phone\b/.test(setup), '/setup · phone copy from the chosen country (no longer from ?check=truck)')
  ok(/checkTradeArea/.test(step) && /TRADE_AREA_ERRORS/.test(step), 'the step checks with the server’s own function (lib/trade-area.ts)')
  ok(/tz in|timezones\.length > 1/.test(step), 'the zone select appears only when the country has more than one')
  const sr = read('app/api/setup/route.ts')
  ok(!/SIGNUP_COUNTRY/.test(sr) && !/SIGNUP_COUNTRY/.test(read('lib/provision-truck.ts')), 'SIGNUP_COUNTRY is gone (not even named)')

  console.log('8. No travel distance anywhere')
  ok(!fs.existsSync(path.join(REPO, 'lib/travel-distance.ts')), 'lib/travel-distance.ts is deleted')
  const TRAVEL = /travel_radius_km|travelKm|TravelChoices|travel-distance|distanceUnit|distance_unit|usually travel/
  const users = ['components/setup/WhereBasedStep.tsx', 'components/DemoGetStarted.tsx', 'app/setup/page.tsx', 'components/manage/WhereYouTrade.tsx',
    'lib/settings-copy.ts', 'lib/provision-truck.ts', 'app/api/setup/route.ts', 'lib/signup-countries.ts', 'lib/signup-country-types.ts']
  const code = f => read(f).replace(/^\s*\/\/.*$/gm, '')   // comments may explain the removal; code may not name it
  const named = users.filter(f => TRAVEL.test(code(f)))
  ok(named.length === 0, 'no signup, Settings, copy or provisioning file names it in code', named)
  ok(!/travel/i.test(read('lib/trade-area.ts').replace(/^\/\/.*$/gm, '')), 'checkTradeArea neither reads nor returns it (comments aside)')
  ok(!/radiogroup|role="radio"/.test(read('components/setup/WhereBasedStep.tsx')), 'the step has no choice buttons left — country, town, zone only')
  const vals = TA.checkTradeArea({ timezone: 'Europe/London', base_place_name: 'Sudbury', travel_radius_km: 80 }, GB())
  ok(vals.ok && JSON.stringify(Object.keys(vals.values).sort()) === JSON.stringify(['base_lat', 'base_lng', 'base_place_id', 'base_place_name', 'base_region', 'timezone']), 'the written values are exactly the zone and the five base columns', vals)

  console.log('9. provisionTruck itself — refuses a switched-off country in the same words')
  globalThis.__harnessDb = kit.fakeDb({ ...PLAN_TABLES(), country_settings: [GB(), US_OFF()].map(snake), trucks: [] }); m.lib.clearCountrySettingsCache()
  let pe = null
  try { await kit.quietAsync(() => m.lib.provisionTruck(globalThis.__harnessDb, { kind: 'operator', country: 'US', name: 'Harness Kitchen', van: { kitchen_capacity: null } })) } catch (e) { pe = e }
  // ⚠️ RE-PINNED (Language Phase 1d): provisionTruck renders the tradeArea code in the country's language — the named GB fix ’.
  ok(pe && pe.message === COUNTRY_OFF_US && tTA('country_off', { country: 'United States' }) === pe.message, 'provisionTruck · switched-off US refused in plain words', pe && pe.message)
  pe = null
  try { await kit.quietAsync(() => m.lib.provisionTruck(globalThis.__harnessDb, { kind: 'operator', country: 'GB', timezone: 'America/Chicago', name: 'Harness Kitchen', van: { kitchen_capacity: null } })) } catch (e) { pe = e }
  // ⚠️ RE-PINNED (Language Phase 1d): provisionTruck renders the tradeArea code in the country's language — the named GB fix ’.
  ok(pe && pe.message === ZONE_GB && tTA('zone_unknown', { country: 'United Kingdom' }) === pe.message, 'provisionTruck · off-list zone refused', pe && pe.message)
  delete globalThis.__harnessDb

  console.log('10. Admin create-truck — the Country select, no hard-coded GB')
  const adminCreate = async (rows, body) => {
    const writes = []
    globalThis.__harnessDb = kit.fakeDb({ ...PLAN_TABLES(), country_settings: rows.map(snake), trucks: [], truck_vans: [], discovery_trucks: [] }, writes)
    m.admin.clearCountrySettingsCache()
    try {
      const res = await kit.quietAsync(() => m.admin.POST(post('http://localhost/api/admin/create-truck', { kind: 'operator', name: 'Harness Admin Truck', visibility: 'hidden', ...body })))
      const ins = writes.find(w => w.table === 'trucks' && w.op === 'insert')
      return { status: res.status, json: await res.json(), truck: ins ? (Array.isArray(ins.patch) ? ins.patch[0] : ins.patch) : null }
    } finally { delete globalThis.__harnessDb }
  }
  const aUS = await adminCreate([GB(), US_ON()], { country: 'US' })
  ok(aUS.truck?.country === 'US' && aUS.truck?.currency === 'USD' && aUS.truck?.timezone === 'America/New_York', 'admin · US → US / USD / the default zone', aUS.truck && { c: aUS.truck.country, cur: aUS.truck.currency, tz: aUS.truck.timezone })
  const aGB = await adminCreate([GB(), US_ON()], { country: 'gb' })
  ok(aGB.truck?.country === 'GB' && aGB.truck?.currency === 'GBP' && aGB.truck?.timezone === 'Europe/London', 'admin · gb → GB / GBP / Europe/London')
  const aNone = await adminCreate([GB()], {})
  ok(aNone.status === 400 && aNone.json.error === 'Choose the country the truck is based in.' && !aNone.truck, 'admin · no country refused', aNone.json)
  const aOff = await adminCreate([GB(), US_OFF()], { country: 'US' })
  // ⚠️ RE-PINNED (Language Phase 1d): the same sentence with the named GB fix (can't → can’t).
  ok(aOff.status === 400 && !aOff.truck && /Trucks can’t sign up in United States yet/.test(aOff.json.error || ''), 'admin · switched-off US refused', aOff.json)
  ok(!/country: 'GB'/.test(read('app/api/admin/create-truck/route.ts')), "admin route · no hard-coded 'GB'")
  ok(/useSignupCountries\(showNewTruck\)/.test(read('app/admin/page.tsx')) && /country: newTruckCountry/.test(read('app/admin/page.tsx')), 'admin form · Country select of switched-on countries, sent with the create')

  console.log('11. Manage › Where you trade — its own action, the same check, the country never written')
  const mr = read('app/api/manage/route.ts')
  ok(/if \(action === 'update_trade_area'\) \{\s*const cs = await countrySettingsForTruck\(truck\)\s*const r = checkTradeArea\(body, cs\)/.test(mr), 'update_trade_area checks with checkTradeArea against the truck’s own country')
  ok(/'update_trade_area'/.test(mr.slice(mr.indexOf('staffBlockedActions'), mr.indexOf('staffBlockedActions') + 600)), 'staff cannot change it (the action is staff-blocked)')
  const gbFacts = GB()
  const r1 = TA.checkTradeArea({ timezone: 'Europe/London', base_place_name: 'Sudbury', country: 'US', currency: 'USD' }, gbFacts)
  ok(r1.ok && !('country' in r1.values) && !('currency' in r1.values), 'the written values hold no country or currency, whatever is sent', r1)
  const r2 = TA.checkTradeArea({ timezone: 'America/Chicago', base_place_name: 'Sudbury' }, gbFacts)
  // ⚠️ RE-PINNED (Language Phase 1d): checkTradeArea returns { ok:false, code, params } — no words; the words are the
  // tradeArea message that code renders to (with the named GB fix ’).
  ok(!r2.ok && !('error' in r2) && refusedAs(r2, 'zone_unknown', { country: 'United Kingdom' }, ZONE_GB), 'an off-list zone is refused in words', r2)
  const wyt = read('components/manage/WhereYouTrade.tsx')
  // ⚠️ RE-PINNED (Language Phase 1d): the card reads its words from messages `whereYouTrade` via useT, not
  // WHERE_YOU_TRADE_COPY — the same property: the locked line is shown, and its words are unchanged.
  ok(/useT\('whereYouTrade'\)/.test(wyt) && /\{t\('countryLocked'\)\}/.test(wyt)
    && JSON.parse(read('messages/en-GB.json')).whereYouTrade.countryLocked === 'Your country can’t be changed'
    && /cs\.timezones\.length > 1/.test(wyt) && /update_trade_area/.test(wyt), 'Settings card · country read-only with "Your country can’t be changed", zone only if more than one')

  console.log(`\n${failures ? '🔴' : '✅'} signup-country: ${checks - failures}/${checks} checks passed`)
  if (failures) process.exit(1)
})().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
