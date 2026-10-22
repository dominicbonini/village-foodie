#!/usr/bin/env node
// scripts/schedules-country-parity.cjs — schedules by country (Phase 2D-2 Part A, docs/schedules-country-report.md).
//
//   node scripts/schedules-country-parity.cjs                    GB parity against BEFORE, then the cross-country proofs
//   node scripts/schedules-country-parity.cjs --capture <file>   snapshot the current code's GB behaviour
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// The REAL modules and routes are bundled (scripts/_render-kit.cjs) and run against an in-memory database with
// REAL unique keys (scripts/_fake-pg.cjs): the discovery gate, the bridge (/api/inbound-schedule), the ingest
// route, the Village Foodie feed (/api/discovery/events), the admin screenshot route end to end (Gemini
// stubbed, its call to the bridge wired straight into the bridge's own handler), the geocoder route, and every
// GB prompt. Email is a recorder; nothing reaches a network. The scraper's prompts are evaluated from its own
// source text, so they are compared exactly as they would be sent.
// BEFORE was captured on the unchanged code (scripts/fixtures/schedules-country-before.json). AFTER, GB must
// match it except the differences this harness names, one by one.

const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'schedules-country' })
const { REPO } = kit
const { makeFakePg, KEYS_BEFORE, KEYS_AFTER, KEYS_BOTH, COUNTRY_DEFAULTS } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const BEFORE_FILE = 'scripts/fixtures/schedules-country-before.json'
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

process.env.INBOUND_SCHEDULE_SECRET = 'harness-secret'
process.env.GEMINI_API_KEY = 'harness-gemini'
process.env.HATCHGRAB_API_URL = 'http://127.0.0.1:3999'
process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
process.env.SUPABASE_URL = 'http://127.0.0.1:9'

const NOW = '2026-10-09T14:20:00.000Z'
const STUBS = {
  '@/lib/email': `export async function sendConfirmationEmail(m) { (globalThis.__emails = globalThis.__emails || []).push({ to: m.to, subject: m.subject, text: m.text }) ; return { ok: true } }`,
  '@/lib/auth/admin': `export async function verifyAdmin() { return true }`,
}

/* ─────────────────────────── FIXTURES — a small GB world ─────────────────────────── */
const GB_SETTINGS = snake(SEEDS.gbFromSeed())
const US_SETTINGS = snake({ ...SEEDS.usFromSeed(), enabled: false })
function world({ after = false, us = false } = {}) {
  const c = row => (after ? { country: 'GB', ...row } : row)
  const dt = (id, name, extra = {}) => c({ id, name, aliases: [], show_on_vf: true, show_on_hg: true, excluded: false, exclude_reason: null,
    cuisine: 'Pizza', phone: null, mobile: null, order_url: null, accepted_methods: null, notes: null, website: null, menu_url: null,
    logo_url: null, photo_url: null, contact_email: null, facebook_url: null, instagram_url: null, hatchgrab_truck_id: null, ...extra })
  const v = (id, name, village, lat, lng, postcode) => c({ id, name, village, latitude: lat, longitude: lng, postcode, phone: null, website: null, photo_url: null })
  const discovery_trucks = [
    dt('dt-gusto', 'Pizzeria Gusto', { hatchgrab_truck_id: 'hg-gusto', contact_email: 'gusto@example.test' }),
    dt('dt-thai', 'Real Thai Food', { aliases: ['RTF Kitchen'] }),
    dt('dt-burger', 'Burger Bros', { phone: '01223 123456' }),
  ]
  const venues = [
    v('v-redlion', 'Red Lion', 'Cambridge', 52.2053, 0.1218, 'CB2 1AA'),
    v('v-fivebells', 'Five Bells', 'Burwell', 52.2760, 0.3270, 'CB25 0EJ'),
    v('v-fox', 'The Fox', 'Burwell', 52.2771, 0.3290, 'CB25 0BA'),
  ]
  const ev = (id, date, truck, venue, village, dtId, vId, extra = {}) => c({ id, event_date: date, start_time: '17:00', end_time: '21:00', truck_name: truck,
    venue_name: venue, village, event_notes: null, source: 'URL', ai_notes: null, discovery_truck_id: dtId, venue_id: vId,
    show_on_vf: true, show_on_hg: true, visibility: 'public', superseded_by: null, created_at: '2026-10-01T09:00:00.000Z', ...extra })
  const discovery_events = [
    ev('de-1', '2026-10-12', 'Real Thai Food', 'Five Bells', 'Burwell', 'dt-thai', 'v-fivebells'),
    ev('de-2', '2026-10-13', 'Burger Bros', 'Red Lion', 'Cambridge', 'dt-burger', 'v-redlion'),
    ev('de-old', '2026-10-01', 'Burger Bros', 'Red Lion', 'Cambridge', 'dt-burger', 'v-redlion'),
  ]
  const trucks = [{ id: 'hg-gusto', name: 'Pizzeria Gusto', contact_email: 'gusto@example.test', dashboard_token: 'tok-gusto', timezone: 'Europe/London',
    country: 'GB', scraper_preference: 'auto', active: true, excluded: false, show_on_vf: true, show_on_hg: true, slug: 'pizzeria-gusto' }]
  return { discovery_trucks, venues, discovery_events, trucks, truck_events: [], truck_vans: [], rejected_event_signatures: [],
    country_settings: us ? [GB_SETTINGS, US_SETTINGS] : [GB_SETTINGS], screenshot_log: [], outreach_prospects: [], outreach_events: [],
    discovery_exclusion_terms: [c({ id: 't-quiz', term: 'Quiz Night', term_key: 'quiz night' })] }
}
function db(opts = {}) {
  const after = !!opts.after
  const pg = makeFakePg(world(opts), { keys: opts.keys || (after ? KEYS_BOTH : KEYS_BEFORE), defaults: after ? COUNTRY_DEFAULTS : {} })
  globalThis.__harnessDb = pg
  globalThis.__emails = []
  return pg
}

/* ─────────────────────────── BUNDLES ─────────────────────────── */
let M
async function mods() {
  if (M) return M
  const clear = `\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`
  M = {
    gate: await kit.bundle('gate', `export * from '@/lib/discovery-gate'` + clear, { stubs: STUBS }),
    inbound: await kit.bundle('inbound', `export { POST } from '@/app/api/inbound-schedule/route'` + clear, { stubs: STUBS }),
    ingest: await kit.bundle('ingest', `export { POST } from '@/app/api/discovery/ingest/route'` + clear, { stubs: STUBS }),
    feed: await kit.bundle('feed', `export { GET } from '@/app/api/discovery/events/route'` + clear, { stubs: STUBS }),
    shots: await kit.bundle('shots', `export { POST, GET } from '@/app/api/admin/screenshot-events/route'` + clear, { stubs: STUBS }),
    geocode: await kit.bundle('geocode', `export { POST } from '@/app/api/manage/geocode/route'`, { stubs: STUBS }),
    lib: await kit.bundle('sc-lib', `export * as SE from '@/lib/admin/screenshot-events'\nexport * as TD from '@/lib/admin/truck-details'\nexport * as SX from '@/lib/schedule-extract'\nexport { truckTimeSettings } from '@/lib/truck-time'` + clear, { stubs: STUBS }),
  }
  return M
}
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const json = (url, body, headers = {}) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })
const clearAll = () => { for (const m of Object.values(M || {})) if (m.clearCountrySettingsCache) m.clearCountrySettingsCache() }

/* ─────────────────────────── GEMINI, STUBBED ─────────────────────────── */
// The admin route calls Gemini three ways; each answer is chosen by the prompt it was sent. The bridge call is
// answered by the bridge's own handler, so a screenshot run goes through the whole write path.
function installFetch(answers) {
  globalThis.__prompts = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u.includes('/api/inbound-schedule')) {
      const res = await M.inbound.POST(new NextRequest(u, { method: 'POST', body: init.body, headers: { 'content-type': 'application/json' } }))
      return res
    }
    if (u.includes('generativelanguage')) {
      const body = JSON.parse(init.body)
      const text = body.contents[0].parts.find(p => p.text)?.text ?? ''
      globalThis.__prompts.push(text)
      const kind = /"kind"/.test(text) ? 'classify' : /Extract the food truck schedule/.test(text) ? 'schedule' : /You are a geocoding service/.test(text) ? 'geocode' : 'details'
      const out = typeof answers[kind] === 'function' ? answers[kind](text) : answers[kind]
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof out === 'string' ? out : JSON.stringify(out) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`harness: unexpected request to ${u}`)
  }
}
async function upload(name, answers, fields = {}) {
  installFetch(answers)
  const fd = new FormData()
  fd.append('files', new File([Buffer.from('not-really-a-png')], name, { type: 'image/png' }))
  fd.append('waiting', '0'); fd.append('consecutiveNonContent', '0')
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  const res = await kit.quietAsync(() => M.shots.POST(new NextRequest('http://127.0.0.1:3999/api/admin/screenshot-events', { method: 'POST', body: fd })))
  return { status: res.status, body: await res.json() }
}

/* ─────────────────────────── THE SCRAPER'S PROMPTS, FROM ITS SOURCE ─────────────────────────── */
// BEFORE: the three templates as they sit inline in scripts/run-scraper.js, evaluated with fixed inputs.
function scraperPromptsFromSource() {
  const src = read('scripts/run-scraper.js')
  const between = (a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); if (i < 0 || j < 0) throw new Error(`scraper source moved: ${a}`); return src.slice(i + a.length, j) }
  const rule = between('prompt = `\n          You are a Data Extraction Bot.', '`;\n      } else {')
  const event = between('prompt = `\n          You are extracting food truck events for:', '`;\n    }\n\n    try {')
  const hg = between('const buildHgPrompt = (pageText) => `', '`;\n\n        // Uses gemini-2.5-flash')
  const site = { name: 'Harness Kitchen', instructions: 'Weekly on Fridays' }, cleanText = 'Friday 10th October — The Fox, Burwell 5pm-9pm'
  const ev = (body, vars) => new Function(...Object.keys(vars), 'return `' + body + '`')(...Object.values(vars))
  return {
    rule: ev('\n          You are a Data Extraction Bot.' + rule, { site, cleanText }),
    event: ev('\n          You are extracting food truck events for:' + event, { site, cleanText }),
    hg: ev(hg, { todayStr: 'Thursday 9 October 2026', currentYear: 2026, pageText: cleanText }),
  }
}

/* ─────────────────────────── THE GB VIEWS (BEFORE and AFTER) ─────────────────────────── */
const SCHED_ANSWER = { events: [
  { DateStart: '12/10/2026', TimeStart: '17:00', TimeEnd: '21:00', 'Truck Name': 'Pizzeria Gusto', 'Venue Name': 'Red Lion', Village: 'Cambridge', Postcode: 'CB2 1AA' },
  { DateStart: '14/10/2026', TimeStart: '12:00', TimeEnd: '14:00', 'Truck Name': 'Pizzeria Gusto', 'Venue Name': 'The Swan', Village: 'Lidgate', Postcode: '' },
  { DateStart: '15/10/2026', TimeStart: '', TimeEnd: '', 'Truck Name': 'Quiz Night', 'Venue Name': 'Red Lion', Village: 'Cambridge', Postcode: '' },
] }
async function gbViews({ after }) {
  await mods()
  kit.setNow(NOW); kit.setDeviceTz('UTC')
  const v = {}

  // 1. prompts
  const { SE, TD, SX, truckTimeSettings } = M.lib
  v.screenshotPrompt = SE.buildScreenshotPrompt(new Date(NOW))
  v.classifyPrompt = TD.buildClassifyPrompt()
  v.detailsPrompt = TD.buildTruckDetailsPrompt()
  db({ after }); clearAll()
  const ts = await truckTimeSettings({ timezone: 'Europe/London', country: 'GB' })
  v.importerPrompt = SX.buildScheduleExtractionPrompt('Friday 10th October The Fox Burwell 5pm-9pm', ts)
  v.importerPromptImage = SX.buildScheduleExtractionPrompt('', ts)
  v.scraper = after ? null : scraperPromptsFromSource()
  installFetch({ geocode: { lat: 52.27, lng: 0.32, confidence: 'high' } })
  await M.geocode.POST(json('http://127.0.0.1:3999/api/manage/geocode', { venueName: 'The Fox', town: 'Burwell', postcode: 'CB25 0BA' }))
  v.geocodePrompt = globalThis.__prompts[0]

  // 2. the gate, alone
  let pg = db({ after }); clearAll()
  const gate = await kit.quietAsync(() => M.gate.admitDiscoveryEvents(pg, [
    { event_date: '2026-10-12', start_time: '17:00', end_time: '21:00', truck_name: 'Pizzeria Gusto', venue_name: 'Red Lion', village: 'Cambridge', source: 'URL', ai_notes: 'CB2 1AA' },
    { event_date: '2026-10-12', start_time: '17:00', end_time: '21:00', truck_name: 'Gusto', venue_name: 'The Fox', village: 'Burwell', source: 'URL' },
    { event_date: '2026-10-13', start_time: '17:00', end_time: '21:00', truck_name: 'Burger Bros', venue_name: 'Red Lion Pub', village: 'Cambridge', source: 'Admin Screenshot' },
    { event_date: '2026-10-14', start_time: '11:00', end_time: '14:00', truck_name: 'New Truck', venue_name: 'Village Green', village: 'Newtown', source: 'URL' },
  ]))
  v.gate = { result: gate, writes: pg.writes }

  // 3. the bridge
  pg = db({ after }); clearAll()
  const br = await kit.quietAsync(() => M.inbound.POST(json('http://127.0.0.1:3999/api/inbound-schedule', { secret: 'harness-secret', events: [
    { event_date: '12/10/2026', start_time: '17:00', end_time: '21:00', truck_name: 'Pizzeria Gusto', venue_name: 'Red Lion', village: 'Cambridge', postcode: 'CB2 1AA', source: 'hg_scraper:scroll' },
    { event_date: '16/10/2026', start_time: '12:00', end_time: '', truck_name: 'Gusto', venue_name: 'Five Bells', village: 'Burwell', source: 'hg_scraper:scroll' },
  ] })))
  v.bridge = { status: br.status, body: await br.json(), writes: pg.writes, emails: globalThis.__emails }

  // 4. ingest
  pg = db({ after }); clearAll()
  const ig = await kit.quietAsync(() => M.ingest.POST(json('http://127.0.0.1:3999/api/discovery/ingest', { secret: 'harness-secret', events: [
    { event_date: '12/10/2026', truck_name: 'Real Thai Food', venue_name: 'The Fox', village: 'Burwell', source: 'URL' },
  ] })))
  v.ingest = { status: ig.status, body: await ig.json(), writes: pg.writes }

  // 5. the Village Foodie feed, both hosts
  v.feed = {}
  for (const host of ['www.villagefoodie.co.uk', 'www.hatchgrab.com']) {
    const fpg = db({ after }); clearAll()
    for (const e of fpg.tables.discovery_events) {
      e.discovery_trucks = fpg.tables.discovery_trucks.find(t => t.id === e.discovery_truck_id) || null
      e.venues = fpg.tables.venues.find(x => x.id === e.venue_id) || null
    }
    const res = await kit.quietAsync(() => M.feed.GET(new NextRequest(`http://${host}/api/discovery/events`, { headers: { host } })))
    v.feed[host] = await res.json()
  }

  // 6. the admin screenshot route, end to end (GB)
  db({ after }); clearAll()
  const shot = await upload('gusto-week.png', { classify: { kind: 'schedule' }, schedule: SCHED_ANSWER }, after ? { country: 'GB' } : {})
  v.screenshot = { status: shot.status, body: shot.body, writes: globalThis.__harnessDb.writes, emails: globalThis.__emails, prompts: globalThis.__prompts }

  // 7. truck details: parse + match on GB fixtures
  const det = TD.parseTruckDetails(JSON.stringify({ name: 'Burger Bros', phone: '+44 1223 123456', email: 'Hello@BurgerBros.test', website: 'https://burgerbros.test/menu', facebook: 'facebook.com/burgerbros', area: 'Cambridge' }))
  const rows = [{ prospect_id: 'p-1', truck_id: 'dt-burger', name: 'Burger Bros', contact_email: null, phone: '01223 123456', mobile: null, website: null }]
  v.details = { det, match: TD.matchProspect(det, rows), us: TD.parseTruckDetails(JSON.stringify({ name: 'Austin Eats', phone: '+1 512 555 0142' })) }
  delete globalThis.__harnessDb
  return v
}

/* ─────────────────────────── COMPARE ─────────────────────────── */
let failures = 0, checks = 0
const ok = (cond, label, detail) => { checks++; if (cond) return; failures++; console.log(`  ✗ ${label}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`) }
const firstDiff = (a, b) => { a = String(a); b = String(b); let i = 0; while (i < a.length && a[i] === b[i]) i++; return i >= a.length && i >= b.length ? null : `at ${i}: «${a.slice(Math.max(0, i - 50), i + 70)}» vs «${b.slice(Math.max(0, i - 50), i + 70)}»` }
const J = x => JSON.stringify(x)
/** A write with the country taken out — and whether every country it carried was GB. */
function withoutCountry(writes) {
  let allGB = true
  const out = writes.map(w => {
    const c = { ...w }
    for (const k of ['row', 'patch', 'payload']) if (c[k] && typeof c[k] === 'object' && !Array.isArray(c[k]) && 'country' in c[k]) {
      if (c[k].country !== 'GB') allGB = false
      c[k] = { ...c[k] }; delete c[k].country
    }
    return c
  })
  return { out, allGB }
}
const GB_C = { code: 'GB', name: 'United Kingdom', addressFormat: 'postcode', dateOrder: 'dmy' }
const US_C = { code: 'US', name: 'United States', addressFormat: 'zip_state', dateOrder: 'mdy' }
const gbLine = 'These screenshots are from United Kingdom (GB), as the person uploading them says. In "Country" give the two-letter code of the country this screenshot itself shows — from its prices, place names, phone numbers and the way dates are written — with "CountryConfidence" high, medium or low, and "CountryReasons" in a few short words (e.g. "prices in $, \'Austin, TX\', dates like 10/12").\n'
const gbFields = '  "Country": "GB", "CountryConfidence": "high|medium|low", "CountryReasons": "short words",\n'
/* ⚠️ RE-PINNED (ireland-1, 20 October 2026): NAMED DIFFERENCE 4 — every screenshot and import prompt names its OUTPUT
 * LANGUAGE (English for a GB truck). The screenshot prompt gains ONE paragraph between the "Times MUST be" line and
 * "JSON FORMAT ONLY"; the importer gains ONE block right after the truck-context block (no context → straight after
 * "Current year is …."). Each is taken out ONLY at that exact place and only if it is there exactly once (else null,
 * which fails the check); the rest must still be byte-identical to BEFORE. */
const ie1ShotLang = 'OUTPUT LANGUAGE: copy truck names, venue names and towns exactly as the screenshot writes them — never translate them. Write anything else (e.g. "CountryReasons") in English.\n\n'
const ie1ImpLang = '\n\nOUTPUT LANGUAGE: copy venue names, towns and addresses exactly as the source writes them — never translate them. Write anything else in English.'
const onlyOnce = (p, x) => typeof p === 'string' && p.indexOf(x) !== -1 && p.indexOf(x) === p.lastIndexOf(x)
const unShotLang = p => { const at = 'Times MUST be "HH:MM".\n\n' + ie1ShotLang + 'JSON FORMAT ONLY'
  return onlyOnce(p, ie1ShotLang) && onlyOnce(p, at) ? p.replace(at, 'Times MUST be "HH:MM".\n\nJSON FORMAT ONLY') : null }
const unImpLang = (p, block = '') => { const at = 'Current year is 2026.' + block + ie1ImpLang + '\n\nYou are extracting a food truck'
  return onlyOnce(p, ie1ImpLang) && onlyOnce(p, at) ? p.replace(ie1ImpLang + '\n\nYou are extracting a food truck', '\n\nYou are extracting a food truck') : null }

async function compare() {
  const B = JSON.parse(read(BEFORE_FILE))
  const A = await gbViews({ after: true })
  const { SE, TD, SX, truckTimeSettings } = M.lib

  console.log('1. GB prompts — byte-identical, except the two named additions')
  // ⚠️ RE-PINNED (ireland-1, 20 October 2026): …with named difference 4 (the OUTPUT LANGUAGE paragraph) taken out.
  ok(unShotLang(SE.buildScreenshotPrompt(new Date(NOW))) === B.screenshotPrompt, 'screenshot prompt with no country: identical apart from the OUTPUT LANGUAGE paragraph (named difference 4)', firstDiff(unShotLang(SE.buildScreenshotPrompt(new Date(NOW))), B.screenshotPrompt))
  const gbShot = SE.buildScreenshotPrompt(new Date(NOW), GB_C)
  ok(gbShot.includes(gbLine) && gbShot.includes(gbFields), 'screenshot prompt, GB: the ONE country line and the three Country fields are there (named difference 1)')
  ok(unShotLang(gbShot.replace(gbLine, '').replace(gbFields, '')) === B.screenshotPrompt, 'screenshot prompt, GB: with those two and the OUTPUT LANGUAGE paragraph (named difference 4) removed, byte-identical — every location line unchanged', firstDiff(unShotLang(gbShot.replace(gbLine, '').replace(gbFields, '')), B.screenshotPrompt))
  ok(A.classifyPrompt === B.classifyPrompt && A.detailsPrompt === B.detailsPrompt, 'classifier and truck-details prompts identical')
  ok(unImpLang(A.importerPrompt) === B.importerPrompt && unImpLang(A.importerPromptImage) === B.importerPromptImage, 'operator importer with no truck context: identical apart from the OUTPUT LANGUAGE block (named difference 4)', firstDiff(unImpLang(A.importerPrompt), B.importerPrompt))
  db({ after: true }); clearAll()
  const ts = await truckTimeSettings({ timezone: 'Europe/London', country: 'GB' })
  const ctx = { truckName: 'Pizzeria Gusto', baseTown: 'Sudbury', baseRegion: 'Suffolk', countryName: 'United Kingdom', addressFormat: 'postcode', recentTowns: ['Burwell', 'Lidgate'] }
  const gbImp = SX.buildScheduleExtractionPrompt('Friday 10th October The Fox Burwell 5pm-9pm', ts, ctx)
  const block = SX.truckContextBlock(ctx)
  ok(block === "\n\nTRUCK CONTEXT — this truck's own area. Use it to place venues and towns; a venue name that exists in several places is most likely the one near these:\n- Truck: Pizzeria Gusto\n- Based in: Sudbury, Suffolk\n- Country: United Kingdom\n- Towns of its recent confirmed events: Burwell, Lidgate", 'importer, GB: the truck-context lines name the truck, base, country and recent towns (named difference 2)', block)
  // ⚠️ RE-PINNED (ireland-1, 20 October 2026): the OUTPUT LANGUAGE block sits right after the context block (named difference 4).
  ok(unImpLang(gbImp, block)?.replace(block, '') === B.importerPrompt, 'importer, GB: with the context lines and the OUTPUT LANGUAGE block (named difference 4) removed, byte-identical — every UK location line unchanged', firstDiff(unImpLang(gbImp, block)?.replace(block, ''), B.importerPrompt))
  const { buildPassARulePrompt, buildPassAEventPrompt, buildHgPrompt } = await import(path.join(REPO, 'scripts/scraper-prompts.js'))
  const site = { name: 'Harness Kitchen', instructions: 'Weekly on Fridays' }, cleanText = 'Friday 10th October — The Fox, Burwell 5pm-9pm'
  ok(buildPassARulePrompt({ site, cleanText, country: 'GB' }) === B.scraper.rule, 'scraper Pass A (rules), GB: identical')
  ok(buildPassAEventPrompt({ site, cleanText, country: 'GB' }) === B.scraper.event, 'scraper Pass A (events), GB: identical', firstDiff(buildPassAEventPrompt({ site, cleanText, country: 'GB' }), B.scraper.event))
  ok(buildHgPrompt({ todayStr: 'Thursday 9 October 2026', currentYear: 2026, pageText: cleanText, addressFormat: 'postcode', dateOrder: 'dmy' }) === B.scraper.hg, 'scraper Pass B, GB: identical')
  const sc = read('scripts/run-scraper.js')
  ok(!sc.includes('You are a Data Extraction Bot.') && !sc.includes('You are extracting food truck events for:') && !sc.includes('TOWN RULES (IMPORTANT)'), 'run-scraper.js carries no second copy of the prompts (they live in scripts/scraper-prompts.js)')
  ok(A.geocodePrompt === B.geocodePrompt, 'geocoder prompt identical (no country sent)')
  installFetch({ geocode: { lat: 52.27, lng: 0.32, confidence: 'high' } })
  await M.geocode.POST(json('http://127.0.0.1:3999/api/manage/geocode', { venueName: 'The Fox', town: 'Burwell', postcode: 'CB25 0BA', country: 'UK' }))
  ok(globalThis.__prompts[0] === B.geocodePrompt, 'geocoder: a UK truck now sends "UK" — its prompt is byte-identical', firstDiff(globalThis.__prompts[0], B.geocodePrompt))
  const page = read('app/manage/[token]/page.tsx')
  // ⚠️ RE-PINNED (address-formats-2, 21 October 2026): the client also sends the truck's ADDRESS FORMAT (and a region or
  // suburb only where the format has one and it holds a value), and the route builds the query from the format's geocode
  // template — GB's is the old join, so the UK prompt above is still byte-identical (and scripts/address-formats-2.cjs
  // compares GB and US queries against a capture of the code before). The country is still sent at all three calls.
  ok((page.match(/tabSettings\.shortName \|\| tabSettings\.name/g) || []).length === 3 && page.includes("body: JSON.stringify({ venueName, town, postcode, country, addressFormat: where.addressFormat, ...(where.region ? { region: where.region } : {}), ...(where.suburb ? { suburb: where.suburb } : {}) }),"), 'geocoder client sends the truck\'s country (and its address format) at all three calls')
  ok(/renderTemplate\(format\.templates\.geocode, \{/.test(read('app/api/manage/geocode/route.ts')) && read('app/api/manage/geocode/route.ts').includes("country: country || 'UK'"), 'the geocoder route builds its query from the format\'s template, "UK" still the country when none is sent')

  console.log('2. GB behaviour — gate, bridge, ingest, feed, screenshot route: identical outputs')
  const gw = withoutCountry(A.gate.writes)
  const gbReason = o => J(o).replace('created on (country, name, village)', 'created on (name, village)')
  ok(gbReason(A.gate.result) === J(B.gate.result), 'gate outcomes identical (the venue-created reason now names the country key — named difference 3)', firstDiff(gbReason(A.gate.result), J(B.gate.result)))
  ok(J(gw.out) === J(B.gate.writes) && gw.allGB, 'gate writes identical once the explicit country (always GB) is set aside', firstDiff(J(gw.out), J(B.gate.writes)))
  const bw = withoutCountry(A.bridge.writes)
  ok(A.bridge.status === B.bridge.status && J(A.bridge.body) === J(B.bridge.body) && J(bw.out) === J(B.bridge.writes) && bw.allGB, 'bridge: response and writes identical (country GB)', firstDiff(J(bw.out), J(B.bridge.writes)))
  ok(J(A.bridge.emails) === J(B.bridge.emails), 'bridge: the same one email to the same operator')
  const iw = withoutCountry(A.ingest.writes)
  ok(A.ingest.status === B.ingest.status && J(A.ingest.body) === J(B.ingest.body).replace('created on (name, village)', 'created on (country, name, village)') && J(iw.out) === J(B.ingest.writes) && iw.allGB, 'ingest: identical (country GB)', firstDiff(J(A.ingest.body), J(B.ingest.body)))
  // ⚠️ RE-PINNED (directions-link-fix, 21 October 2026): the feed now gives each event its country's short name
  // (`countryName`, for the card's Google directions link — lib/maps-links.ts). That ONE key is the named difference: it
  // is required on every event ("UK" here: every row is GB) and set aside; everything else must still be identical.
  // ⚠️ RE-PINNED (address-formats-1, 21 October 2026): …and `addressFormat` (each event's address format key; "gb" here —
  // the GB row's legacy 'postcode' read as gb), required on every event and set aside the same way.
  const withoutCountryName = j => ({ ...j, events: (j?.events || []).map(({ countryName, addressFormat, ...e }) => e) })
  for (const h of Object.keys(B.feed)) ok(J(withoutCountryName(A.feed[h])) === J(B.feed[h]) && (A.feed[h]?.events || []).every(e => e.countryName === 'UK' && e.addressFormat === 'gb'),
    `Village Foodie feed on ${h}: identical, plus countryName "UK" and addressFormat "gb" on every event`, firstDiff(J(withoutCountryName(A.feed[h])), J(B.feed[h])))
  const sw = withoutCountry(A.screenshot.writes)
  ok(A.screenshot.status === B.screenshot.status && J(A.screenshot.body) === J(B.screenshot.body), 'screenshot route, GB: the response is identical', firstDiff(J(A.screenshot.body), J(B.screenshot.body)))
  ok(J(sw.out) === J(B.screenshot.writes) && sw.allGB, 'screenshot route, GB: the same writes (country GB)', firstDiff(J(sw.out), J(B.screenshot.writes)))
  ok(J(A.screenshot.emails) === J(B.screenshot.emails), 'screenshot route, GB: the same email')
  // ⚠️ RE-PINNED (ireland-1, 20 October 2026): …plus named difference 4 (the OUTPUT LANGUAGE paragraph) in the extraction prompt.
  ok(A.screenshot.prompts[0] === B.screenshot.prompts[0] && A.screenshot.prompts[1].includes(gbLine) && unShotLang(A.screenshot.prompts[1].replace(gbLine, '').replace(gbFields, '')) === B.screenshot.prompts[1], 'screenshot route, GB: the prompts sent are the BEFORE prompts plus named differences 1 and 4', firstDiff(unShotLang(A.screenshot.prompts[1].replace(gbLine, '').replace(gbFields, '')), B.screenshot.prompts[1]))
  ok(J(A.details) === J(B.details), 'truck details, GB: parsed and matched identically (a +1 number is still not a UK number)')

  console.log('3. Cross-country')
  await crossCountry()

  console.log(`\n${failures ? '🔴' : '✅'} schedules-country-parity: ${checks - failures}/${checks} checks passed`)
  if (failures) process.exit(1)
}

/* ─────────────────────────── CROSS-COUNTRY PROOFS ─────────────────────────── */
const usWorld = (keys = KEYS_AFTER) => {
  const pg = db({ after: true, us: true, keys }); clearAll()
  pg.tables.outreach_prospects.push({ id: 'p-gusto', discovery_truck_id: 'dt-gusto', stage: 'not_contacted',
    truck: { id: 'dt-gusto', name: 'Pizzeria Gusto', contact_email: 'gusto@example.test', phone: '01787 123456', mobile: null, website: 'pizzeriagusto.test', facebook_url: null, instagram_url: null, country: 'GB' } })
  return pg
}
const usSchedule = (country = 'US', conf = 'high', reasons = "prices in $, 'Cambridge, MA', dates like 10/12") => ({ Country: country, CountryConfidence: conf, CountryReasons: reasons, events: [
  { DateStart: '12/10/2026', TimeStart: '17:00', TimeEnd: '21:00', 'Truck Name': 'Pizzeria Gusto', 'Venue Name': 'Red Lion', Village: 'Cambridge', State: 'MA', Postcode: '02139' },
  { DateStart: '13/10/2026', TimeStart: '11:00', TimeEnd: '14:00', 'Truck Name': 'Pizzeria Gusto', 'Venue Name': 'Harvard Yard', Village: 'Cambridge', State: 'MA', Postcode: '' },
] })
async function crossCountry() {
  const { SE, TD, SX, truckTimeSettings } = M.lib

  // ── 3a. A US "Pizzeria Gusto" screenshot, uploaded as US ──
  let pg = usWorld()
  let r = await upload('austin.png', { classify: { kind: 'schedule' }, schedule: usSchedule() }, { country: 'US' })
  let res = r.body.results?.[0] || {}
  const usEvents = pg.tables.discovery_events.filter(e => e.country === 'US')
  ok(r.status === 200 && res.outcome === 'schedule' && usEvents.length === 2, 'US screenshot as US: two US events written', { status: r.status, res, n: usEvents.length })
  ok(usEvents.every(e => e.discovery_truck_id === null), 'US "Pizzeria Gusto" does NOT attach to the UK Pizzeria Gusto discovery row', usEvents.map(e => e.discovery_truck_id))
  ok(pg.tables.truck_events.length === 0 && (globalThis.__emails || []).length === 0 && res.bridged === 0, 'nothing bridged to the UK operator, and no email sent', { te: pg.tables.truck_events.length, emails: globalThis.__emails })
  ok(usEvents.every(e => e.show_on_vf === false && e.show_on_hg === false), 'every US row is written hidden on both sites')
  const usRedLion = pg.tables.venues.find(v => v.name === 'Red Lion' && v.country === 'US')
  const ukRedLion = pg.tables.venues.find(v => v.id === 'v-redlion')
  ok(usRedLion && usRedLion.id !== 'v-redlion' && usRedLion.village === 'Cambridge' && usRedLion.region === 'MA' && ukRedLion.country === 'GB', 'a US "Red Lion, Cambridge" creates its OWN US venue (region MA), separate from the UK one', usRedLion)
  ok(usEvents.find(e => e.venue_name === 'Red Lion').venue_id === usRedLion?.id, '…and the US event points at the US venue, not the UK one')
  const shotPrompt = globalThis.__prompts.find(p => /Extract the food truck schedule/.test(p))
  ok(/two-letter state in "State"/.test(shotPrompt) && /ZIP codes look like "78701"/.test(shotPrompt) && !/UK postcodes/.test(shotPrompt) && /MONTH first in United States/.test(shotPrompt), 'the US prompt asks for city, state and ZIP, and reads numbers-only dates month first')

  // ── 3b. the bridge, directly ──
  pg = usWorld()
  let br = await kit.quietAsync(() => M.inbound.POST(json('http://127.0.0.1:3999/api/inbound-schedule', { secret: 'harness-secret', country: 'US', events: [
    { event_date: '12/10/2026', truck_name: 'Pizzeria Gusto', venue_name: 'Red Lion', village: 'Cambridge', source: 'Admin Screenshot' }] })))
  let bb = await br.json()
  ok(bb.bridged === 0 && pg.tables.truck_events.length === 0 && (globalThis.__emails || []).length === 0, 'bridge, US batch named "Pizzeria Gusto": no link to the UK truck, nothing bridged, no email', bb)
  pg = usWorld()
  br = await kit.quietAsync(() => M.inbound.POST(json('http://127.0.0.1:3999/api/inbound-schedule', { secret: 'harness-secret', country: 'US', hatchgrab_truck_id: 'hg-gusto', events: [
    { event_date: '12/10/2026', truck_name: 'Pizzeria Gusto', venue_name: 'Red Lion', village: 'Cambridge', source: 'hg_scraper:scroll' }] })))
  bb = await br.json()
  ok(bb.bridged === 0 && pg.tables.truck_events.length === 0 && (globalThis.__emails || []).length === 0, 'bridge, US batch carrying the UK truck\'s own id: refused (trucks.country is GB) — nothing bridged, no email', bb)
  pg = usWorld()
  br = await kit.quietAsync(() => M.inbound.POST(json('http://127.0.0.1:3999/api/inbound-schedule', { secret: 'harness-secret', hatchgrab_truck_id: 'hg-gusto', events: [
    { event_date: '17/10/2026', truck_name: 'Some Other Spelling', venue_name: 'Five Bells', village: 'Burwell', source: 'hg_scraper:scroll' }] })))
  bb = await br.json()
  ok(bb.bridged === 1 && pg.tables.truck_events[0]?.truck_id === 'hg-gusto' && (globalThis.__emails || []).length === 1, 'bridge, GB batch with the HatchGrab id (as Pass B now sends): links THAT truck, whatever the name says', bb)
  const runSrc = read('scripts/run-scraper.js')
  ok(/country: hgTruck\.country \|\| 'GB',\s*hatchgrab_truck_id: hgTruck\.id,/.test(runSrc) && /scraper_last_run_at, timezone, dashboard_token, operator_id, country'\)/.test(runSrc), 'scraper Pass B selects trucks.country and sends its country and truck id')

  // ── 3c. the same key in another country is left alone ──
  pg = usWorld()
  pg.tables.discovery_events.push({ id: 'de-uk-gusto', event_date: '2026-10-20', start_time: '17:00', truck_name: 'Pizzeria Gusto', venue_name: 'Red Lion', village: 'Cambridge', country: 'GB', show_on_vf: true, discovery_truck_id: 'dt-gusto', venue_id: 'v-redlion', created_at: '2026-10-01T00:00:00Z', superseded_by: null, source: 'URL' })
  const g = await kit.quietAsync(() => M.gate.admitDiscoveryEvents(pg, [{ event_date: '2026-10-20', start_time: '18:00', truck_name: 'Pizzeria Gusto', venue_name: 'Red Lion', village: 'Cambridge', source: 'Admin Screenshot' }], { country: 'US' }))
  const uk = pg.tables.discovery_events.find(e => e.id === 'de-uk-gusto')
  ok(g.outcomes[0].wrote === 'skipped' && uk.country === 'GB' && uk.start_time === '17:00' && uk.discovery_truck_id === 'dt-gusto', 'a US event with the same date, truck and venue as a UK one is skipped — the UK row is untouched', g.outcomes[0])

  // ── 3d. a same-named US truck gets its own discovery row ──
  for (const [label, keys, want] of [['after 20261010_16 (country-scoped keys only)', KEYS_AFTER, true], ['between _15 and _16 (both sets live)', KEYS_BOTH, false]]) {
    pg = usWorld(keys)
    r = await upload('gusto-fb.png', { classify: { kind: 'truck_details' }, details: { name: 'Pizzeria Gusto', phone: '+1 512 555 0142', email: 'hello@gusto-austin.test' } }, { country: 'US' })
    res = r.body.results?.[0] || {}
    const usTruck = pg.tables.discovery_trucks.find(t => t.name === 'Pizzeria Gusto' && t.country === 'US')
    if (want) ok(res.outcome === 'new_truck' && usTruck && usTruck.id !== 'dt-gusto' && usTruck.show_on_vf === false && usTruck.phone === '(512) 555-0142', `US details screenshot ${label}: its own US "Pizzeria Gusto" row, hidden, with its +1 number kept`, { res, usTruck })
    else ok(res.outcome === 'failed' && !usTruck && /duplicate key/.test(res.error || ''), `…${label}: the old global name key still refuses it — which is why 20261010_16 runs after deploy`, res)
    ok(!pg.tables.discovery_trucks.find(t => t.id === 'dt-gusto' && t.contact_email !== 'gusto@example.test'), `${label}: the UK Pizzeria Gusto row is not touched`)
  }
  const old = makeFakePg({ discovery_trucks: [] }, { keys: KEYS_AFTER })
  const oldWrite = await old.from('discovery_trucks').upsert({ name: 'X' }, { onConflict: 'name' })
  ok(oldWrite.error?.code === '42P10', "after 20261010_16 an onConflict 'name' write fails with 42P10 — so no writer may still name it")
  const allSrc = ['scripts/run-scraper.js', 'lib/discovery-gate.ts', 'scripts/import-hatchesup-schedule.js', 'scripts/process-next-truck.js', 'scripts/migrate-from-sheets.cjs', 'app/api/admin/screenshot-events/route.ts'].map(read).join('\n')
  ok(!/onConflict: 'name'(?!,)/.test(allSrc.replace(/outreach_snippets/g, '')) && !/onConflict: 'name,village'/.test(allSrc) && (allSrc.match(/onConflict: 'country,name'/g) || []).length >= 4 && (allSrc.match(/onConflict: 'country,name,village'/g) || []).length >= 3, 'every discovery_trucks / venues writer names the country-scoped key')

  // ── 3e. matching a screenshot to a prospect stays in its country ──
  const usDet = TD.parseTruckDetails(J({ name: 'Pizzeria Gusto', phone: '+1 512 555 0142' }), 'US')
  ok(TD.matchProspect(usDet, [], 'US').kind === 'none', 'a US screenshot with only the name "Pizzeria Gusto" matches no prospect (the UK one is not a US candidate)')
  ok(TD.parseTruckDetails(J({ phone: '+1 512 555 0142' }), 'GB').phone === null && TD.parseTruckDetails(J({ phone: '(512) 555-0142' }), 'US').phone === '(512) 555-0142', 'phones are read in the chosen country: kept for US, the UK rule unchanged for GB')

  // ── 3f. Village Foodie never shows a US row ──
  pg = usWorld()
  pg.tables.discovery_trucks.push({ id: 'dt-us', name: 'Austin Eats', aliases: [], country: 'US', show_on_vf: true, show_on_hg: true, excluded: false })
  pg.tables.discovery_events.push({ id: 'de-us', event_date: '2026-10-15', start_time: '12:00', end_time: '14:00', truck_name: 'Austin Eats', venue_name: 'Red Lion', village: 'Cambridge', country: 'US', show_on_vf: true, show_on_hg: true, superseded_by: null, discovery_truck_id: 'dt-us', venue_id: null,
    discovery_trucks: { name: 'Austin Eats', show_on_vf: true, show_on_hg: true, excluded: false }, venues: null })
  pg.tables.discovery_events.push({ id: 'de-us-orphan', event_date: '2026-10-15', start_time: '12:00', truck_name: 'Real Thai Food', venue_name: 'Harvard Yard', village: 'Cambridge', country: 'US', show_on_vf: true, show_on_hg: true, superseded_by: null, discovery_truck_id: null, venue_id: null, discovery_trucks: null, venues: null })
  pg.trucks = pg.tables.trucks; pg.tables.trucks.push({ id: 'hg-us', name: 'Texas Tacos', country: 'US', active: true, excluded: false, show_on_vf: true, show_on_hg: true, slug: 'texas-tacos' })
  pg.tables.truck_events.push({ id: 'te-us', truck_id: 'hg-us', event_date: '2026-10-15', start_time: '12:00', status: 'confirmed', venue_name: 'Plaza', town: 'Austin', trucks: pg.tables.trucks.find(t => t.id === 'hg-us') })
  for (const e of pg.tables.discovery_events) if (!('discovery_trucks' in e)) { e.discovery_trucks = pg.tables.discovery_trucks.find(t => t.id === e.discovery_truck_id) || null; e.venues = pg.tables.venues.find(v => v.id === e.venue_id) || null }
  const vf = await (await kit.quietAsync(() => M.feed.GET(new NextRequest('http://www.villagefoodie.co.uk/api/discovery/events', { headers: { host: 'www.villagefoodie.co.uk' } })))).json()
  ok(!J(vf).includes('Austin Eats') && !J(vf).includes('Texas Tacos') && !J(vf).includes('Harvard Yard'), 'Village Foodie feed: no US event (even one marked visible), no US truck in the list, no US orphan borrowing a UK truck, no US operator event', J(vf).slice(0, 300))
  const slugFeed = await (await kit.quietAsync(() => M.feed.GET(new NextRequest('http://www.villagefoodie.co.uk/api/discovery/events?slug=real-thai-food', { headers: { host: 'www.villagefoodie.co.uk' } })))).json()
  ok(slugFeed.events.length >= 1 && slugFeed.events.every(e => e.venueName !== 'Harvard Yard'), 'a truck page (?slug=) shows only that truck\'s UK events')
  const fr = read('app/api/discovery/events/route.ts')
  ok((fr.match(/\.eq\('country', VILLAGE_FOODIE_COUNTRY\)/g) || []).length === 3, 'the feed limits scraped events, the trucks list and the orphan fallback to GB')

  // ── 3g. the hold ──
  for (const [label, conf, held] of [['high', 'high', true], ['medium', 'medium', true], ['low', 'low', false]]) {
    pg = usWorld()
    r = await upload(`held-${conf}.png`, { classify: { kind: 'both' }, schedule: usSchedule('US', conf), details: { name: 'Pizzeria Gusto', email: 'hello@gusto-austin.test' } }, { country: 'GB' })
    res = r.body.results?.[0] || {}
    const dataWrites = pg.writes.filter(w => w.table !== 'screenshot_log')
    if (held) {
      ok(res.outcome === 'held_country' && dataWrites.length === 0 && pg.tables.truck_events.length === 0 && (globalThis.__emails || []).length === 0, `chosen UK, model says US with ${label} confidence: HELD — nothing written (no gate, no bridge, no prospect), no email`, { outcome: res.outcome, writes: dataWrites.map(w => w.table + ':' + w.op) })
      ok(res.held?.detected === 'US' && res.held?.chosen === 'GB' && res.held?.detectedName === 'United States' && res.held?.detectedKnown === true && res.held?.events?.length === 2 && res.held?.reasons.includes("'Cambridge, MA'"), '…the row carries both countries, the reasons and the two events to re-submit', res.held)
      ok(pg.tables.screenshot_log.at(-1)?.outcome === 'held_country', '…and the log records "held_country"')
    } else {
      ok(res.outcome !== 'held_country' && pg.tables.discovery_events.some(e => e.truck_name === 'Pizzeria Gusto' && e.country === 'GB'), 'low confidence is NOT held — it goes through as the chosen country', res.outcome)
    }
  }
  pg = usWorld()
  r = await upload('held-fr.png', { classify: { kind: 'schedule' }, schedule: usSchedule('FR', 'high', 'prices in €') }, { country: 'GB' })
  ok(r.body.results[0].outcome === 'held_country' && r.body.results[0].held.detectedKnown === false && r.body.results[0].held.detectedName === 'France', 'a confident country we have no settings for (France) is held, and cannot be "Added as" it', r.body.results[0].held)

  // ── 3h. Add as / Keep as re-submit with the right country ──
  pg = usWorld()
  r = await upload('held.png', { classify: { kind: 'schedule' }, schedule: usSchedule() }, { country: 'GB' })
  const held = r.body.results[0].held
  installFetch({})
  let d = await kit.quietAsync(() => M.shots.POST(json('http://127.0.0.1:3999/api/admin/screenshot-events', { action: 'country_confirm', country: 'US', events: held.events, fileName: 'held.png' })))
  let dj = await d.json()
  ok(d.status === 200 && dj.outcome === 'schedule' && pg.tables.discovery_events.filter(e => e.country === 'US').length === 2 && pg.tables.truck_events.length === 0 && (globalThis.__emails || []).length === 0, '"Add as United States": the two events are written as US — not bridged, no email', dj)
  pg = usWorld()
  installFetch({})
  d = await kit.quietAsync(() => M.shots.POST(json('http://127.0.0.1:3999/api/admin/screenshot-events', { action: 'country_confirm', country: 'GB', events: held.events, fileName: 'held.png' })))
  dj = await d.json()
  ok(d.status === 200 && pg.tables.discovery_events.filter(e => e.truck_name === 'Pizzeria Gusto' && e.country === 'GB').length === 2 && pg.tables.discovery_events.every(e => e.country === 'GB'), '"Keep as United Kingdom": the same events are written as GB', dj)
  pg = usWorld()
  d = await kit.quietAsync(() => M.shots.POST(json('http://127.0.0.1:3999/api/admin/screenshot-events', { action: 'country_confirm', country: 'ZZ', events: held.events })))
  ok(d.status === 400 && pg.writes.length === 0, 'a country we do not have is refused, nothing written')
  const route = read('app/api/admin/screenshot-events/route.ts')
  ok(route.indexOf("if (body.action === 'country_confirm') return confirmCountry(req, body)") < route.indexOf('const hasSocial = await socialColumnsReady()\n  if (!hasSocial) return NextResponse.json({ error: `${MIGRATION_SOCIAL}. Nothing was written.` }, { status: 409 })'), 'decide(): the country decision is handled BEFORE the social-column 409 (audit §2.2)')
  r = await upload('none.png', { classify: { kind: 'schedule' }, schedule: usSchedule() }, {})
  ok(r.status === 400 && /Choose the country/.test(r.body.error), 'an upload with no country is refused: "Choose the country these screenshots are from first."')

  // ── 3i. exclusions apply in their own country ──
  pg = usWorld()
  r = await upload('quiz-us.png', { classify: { kind: 'schedule' }, schedule: { Country: 'US', CountryConfidence: 'high', CountryReasons: '$', events: [{ DateStart: '12/10/2026', 'Truck Name': 'Quiz Night', 'Venue Name': 'Plaza', Village: 'Austin', State: 'TX' }] } }, { country: 'US' })
  ok(r.body.results[0].dropped.length === 0 && r.body.results[0].kept === 1, 'the UK exclusion term "Quiz Night" does not silence a US truck of that name', r.body.results[0])

  // ── 3j. the operator importer for a US truck ──
  const usTs = await truckTimeSettings({ timezone: 'America/Chicago', country: 'US' })
  const usImp = SX.buildScheduleExtractionPrompt('', usTs, { truckName: 'Texas Tacos', baseTown: 'Austin', baseRegion: 'Texas', countryName: 'United States', addressFormat: 'zip_state', recentTowns: ['Austin', 'Round Rock'] })
  ok(/state="TX"/.test(usImp) && /ZIP codes are five digits/.test(usImp) && /MONTH first/.test(usImp) && /Based in: Austin, Texas/.test(usImp) && !/UK postcodes/.test(usImp) && !/UK venues/.test(usImp), 'importer, US truck: city/state/ZIP lines, month-first dates, and its own context; no UK lines')
  const ctxSrc = read('lib/schedule-context.ts')
  ok(/\.in\('status', CONFIRMED\)/.test(ctxSrc) && /RECENT_EVENTS_FOR_CONTEXT = 15/.test(ctxSrc) && /\.limit\(RECENT_EVENTS_FOR_CONTEXT\)/.test(ctxSrc), 'importer context: the towns of the last 15 confirmed events, distinct')
  ok(/scheduleContextForTruck\(supabase, truck\)/.test(read('app/api/manage/process-schedule/route.ts')) && /scheduleContextForTruck\(supabase, truck\)/.test(read('app/api/manage/verify-schedule-url/route.ts')), 'both importer routes pass the truck context')

  // ── 3k. the other matchers ──
  ok(/\.ilike\('name', shadowName\)\.eq\('country', truckData\?\.country \|\| 'GB'\)/.test(read('app/api/admin/create-operator/route.ts')), 'graduation excludes the shadow in the truck\'s own country only')
  const out = read('app/api/admin/outreach/route.ts')
  ok(/const key = `\$\{\(e\.country \|\| 'GB'\)\.toUpperCase\(\)\}\|\$\{n\}`/.test(out) && /idx\.get\(`\$\{c\}\|\$\{k\}`\)/.test(out), 'outreach schedule tokens: keyed by country and name')
  ok(/keysByCountry/.test(read('app/api/admin/discovery-events/route.ts')) && /scopedCountry/.test(read('app/api/admin/discovery-events/route.ts')), 'admin events: the orphan flag and the Schedule popup compare within a country')
  ok(/\.eq\('country', SOURCE_COUNTRY\)/.test(runSrc) && (runSrc.match(/\.eq\('country', SOURCE_COUNTRY\)/g) || []).length >= 5, 'scraper Pass A reads, matches and scrapes GB rows only')
  const vm = read('lib/venue-matcher.ts')
  ok(/allVenuesAnyCountry \?\? \[\]\)\.filter\(v => \(v\.country \|\| 'GB'\)\.toUpperCase\(\) === want\)/.test(vm), 'findVenue only ever considers venues in the given country (GB by default)')
  ok(/AND|\.eq\('country', country\)/.test(read('app/api/admin/screenshot-events/route.ts')) && /\.eq\('country', country\)\.limit\(10000\)/.test(route), 'screenshot exclusions read the chosen country\'s terms only')
}

/* ─────────────────────────── CAPTURE ─────────────────────────── */
if (require.main === module && !CAPTURE) {
  ;(async () => { await compare() })().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
}
if (require.main === module && CAPTURE) {
  ;(async () => {
    const v = await gbViews({ after: false })
    fs.writeFileSync(path.resolve(CAPTURE), JSON.stringify(v, null, 1))
    console.log(`captured ${Object.keys(v).join(', ')} → ${CAPTURE}`)
  })().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
}

module.exports = { gbViews, mods, db, world, upload, installFetch, json, clearAll, NOW, SCHED_ANSWER, BEFORE_FILE, scraperPromptsFromSource, STUBS, GB_SETTINGS, US_SETTINGS }
