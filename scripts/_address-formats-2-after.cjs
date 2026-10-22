// scripts/_address-formats-2-after.cjs — the checks of scripts/address-formats-2.cjs, run on the code AFTER this stage.
// A MODULE: the harness passes its kit, its counters, its fixtures and `snapshot()` (the same calls it captured BEFORE).
const fs = require('fs'); const path = require('path')
const LP = require('./_lp1d-fixtures.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const { makeFakePg } = require('./_fake-pg.cjs')

const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const text = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

// The four formats this stage switches on, as country rows (the GB seed with the country's own facts).
const COUNTRY = {
  ie: { countryCode: 'IE', name: 'Ireland', shortName: 'Ireland', currency: 'EUR', locale: 'en-IE', addressFormat: 'ie', timezones: ['Europe/Dublin'], defaultTimezone: 'Europe/Dublin', allergenCardOnlyAllowed: false },
  au: { countryCode: 'AU', name: 'Australia', shortName: 'Australia', currency: 'AUD', locale: 'en-AU', addressFormat: 'au', timezones: ['Australia/Sydney'], defaultTimezone: 'Australia/Sydney' },
  nz: { countryCode: 'NZ', name: 'New Zealand', shortName: 'NZ', currency: 'NZD', locale: 'en-NZ', addressFormat: 'nz', timezones: ['Pacific/Auckland'], defaultTimezone: 'Pacific/Auckland' },
  ca: { countryCode: 'CA', name: 'Canada', shortName: 'Canada', currency: 'CAD', locale: 'en-GB', addressFormat: 'ca', timezones: ['America/Toronto'], defaultTimezone: 'America/Toronto' },
}

/** A fake database whose listed columns do not exist yet (the state before 20261030 is run), and whose trucks table
 *  keeps the old two-letter CHECK on base_region_code — every write or read naming them fails, as PostgREST would. */
function preSqlDb(db, missing, { regionCheck = true } = {}) {
  const fail = (code, message) => {
    const r = { data: null, error: { code, message } }
    const b = { eq: () => b, in: () => b, select: () => b, single: () => b, maybeSingle: () => b, order: () => b, then: (ok, ko) => Promise.resolve(r).then(ok, ko) }
    return b
  }
  const from = db.from.bind(db)
  db.from = t => {
    const q = from(t)
    const miss = missing[t] || []
    const names = obj => Object.keys(obj || {})
    const upd = q.update.bind(q), sel = q.select.bind(q)
    q.update = obj => {
      if (names(obj).some(c => miss.includes(c))) return fail('PGRST204', `Could not find the '${names(obj).find(c => miss.includes(c))}' column of '${t}'`)
      if (regionCheck && t === 'trucks' && typeof obj?.base_region_code === 'string' && !/^[A-Z]{2}$/.test(obj.base_region_code)) return fail('23514', 'new row for relation "trucks" violates check constraint "trucks_base_region_code_chk"')
      return upd(obj)
    }
    q.select = (cols, ...rest) => (typeof cols === 'string' && cols.split(',').map(s => s.trim()).some(c => miss.includes(c)) ? fail('42703', `column ${t}.${miss[0]} does not exist`) : sel(cols, ...rest))
    return q
  }
  return db
}

module.exports = async function after({ kit, t, head, read, REPO, snapshot, SNAP_FILE, PLACE }) {
  const BEFORE = JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8')).outputs
  const MSG = JSON.parse(read('messages/en-GB.json'))
  const F = await kit.bundle('af2-config', "export * from '@/lib/address-formats'\nexport * from '@/lib/event-address'\nexport { splitRegionCodeWrite, checkTradeArea } from '@/lib/trade-area'")

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the config: entry flags, examples, Places, AI rules')
  t('the validator finds nothing wrong in any format', F.validateAddressFormats().length === 0, F.validateAddressFormats())
  const flags = k => JSON.stringify(F.ADDRESS_FORMATS[k].entry)
  t('GB and US: every entry flag off (no asterisks, no live check, no "Customers see:", the free-text State box, no review columns)',
    ['gb', 'us'].every(k => flags(k) === JSON.stringify({ customersSee: false, postalCheck: false, requiredMarks: false, regionInput: 'text', sublines: 'legacy', reviewAndPlaces: false })))
  t('IE, AU, NZ, CA: every entry flag on, the region a dropdown',
    ['ie', 'au', 'nz', 'ca'].every(k => flags(k) === JSON.stringify({ customersSee: true, postalCheck: true, requiredMarks: true, regionInput: 'select', sublines: 'area', reviewAndPlaces: true })))
  const order = k => F.ADDRESS_FORMATS[k].fields.map(f => `${f.key}:${f.label}${f.required ? '*' : ''}`).join(' ')
  t('the approved field orders: IE street / town or area* / county / Eircode; AU street / suburb* / state* / postcode*; NZ street / suburb / town or city* / postcode',
    order('ie') === 'street:street locality:townOrArea* region:county postalCode:eircode'
    && order('au') === 'street:street locality:suburb* region:stateTerritory* postalCode:postcode*'
    && order('nz') === 'street:street suburb:suburb locality:townOrCity* postalCode:postcode', [order('ie'), order('au'), order('nz')])
  t('GB and US keep their locality word ("area" — GB "Area (village, town or city)", en-US "City or town"); Ireland\'s is "Town or area"',
    F.ADDRESS_FORMATS.gb.fields[1].label === 'area' && F.ADDRESS_FORMATS.us.fields[1].label === 'area' && MSG.address.label.area === 'Area (village, town or city)'
    && JSON.parse(read('messages/en-US.json')).address.label.area === 'City or town' && MSG.address.label.townOrArea === 'Town or area')
  t('the messages carry every variant\'s label (postcode, eircode, zip, postalCode; state, stateTerritory, province, county; area, townOrArea, city, suburb, townOrCity)',
    ['postcode', 'eircode', 'zip', 'postalCode', 'state', 'stateTerritory', 'province', 'county', 'area', 'townOrArea', 'city', 'suburb', 'townOrCity'].every(k => typeof MSG.address.label[k] === 'string' && MSG.address.label[k]))
  t('no `{style, select, zip_state …}` is left in any message file', ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ'].every(l => !read(`messages/${l}.json`).includes('zip_state')))
  t('GB/US words moved with identical text: Postcode / ZIP code, "e.g. The Crown" / "e.g. Main Street Brewery", "CB22 5EJ" / "78701", "Zilker Park, Austin"',
    MSG.address.label.postcode === 'Postcode' && MSG.address.label.zip === 'ZIP code' && F.ADDRESS_FORMATS.gb.examples.venue === 'The Crown' && F.ADDRESS_FORMATS.us.examples.venue === 'Main Street Brewery'
    && F.ADDRESS_FORMATS.gb.examples.importPostalCode === 'CB22 5EJ' && F.ADDRESS_FORMATS.us.examples.importPostalCode === '78701' && F.ADDRESS_FORMATS.us.examples.paste === 'Zilker Park, Austin'
    && F.ADDRESS_FORMATS.gb.examples.addressLine === '123 High St, Wickhambrook' && F.ADDRESS_FORMATS.us.examples.region === 'NJ')
  // ⚠️ RE-PINNED (address-formats-2 follow-up, 22 October 2026): the scraper's Pass B prompt reads the config too, so
  // scripts/scraper-prompts.js joins the list (scripts/scraper-prompts-format.cjs proves its prompts).
  const codeBranches = ['lib/schedule-extract.ts', 'lib/admin/screenshot-events.ts', 'lib/event-conflicts.ts', 'lib/places.ts', 'lib/trade-area.ts', 'app/api/manage/geocode/route.ts', 'components/manage/AddressFields.tsx', 'scripts/scraper-prompts.js']
    .filter(f => /code !== 'GB'|=== 'zip_state'|!== 'zip_state'|messagesStyleOf|countryCode === '|\.code\.toUpperCase\(\) !== 'GB'/.test(read(f)))
  t('no country-code or legacy-style branch left in the prompts (the scraper\'s included), conflicts, Places, trade area, geocoder or the form component', codeBranches.length === 0, codeBranches)
  t('`messagesStyleOf` is gone from the app (lib/address-formats.ts no longer has it)', !/export function messagesStyleOf/.test(read('lib/address-formats.ts')))

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · GB and US byte-identical, against the capture of the code before this stage')
  const NOW = await snapshot()
  // The two named changes (item 5): a US ZIP code is an area, so two different venues in it are no longer the same event.
  const CHANGED = {
    'conflicts.usSameZipOtherVenue': '[]',
    'conflicts.usSameZipOtherVenueOverlap': null,   // checked below: 'review' → 'overlap'
  }
  for (const k of Object.keys(BEFORE)) {
    if (k in CHANGED) continue
    t(`${k} — identical`, NOW[k] === BEFORE[k], { before: String(BEFORE[k]).slice(0, 300), now: String(NOW[k]).slice(0, 300) })
  }
  const kinds = s => JSON.parse(s).map(c => c.kind).join(',')
  t('US, two venues in one ZIP code, different times — BEFORE "review" (a false "same venue" warning), AFTER no conflict',
    kinds(BEFORE['conflicts.usSameZipOtherVenue']) === 'review' && NOW['conflicts.usSameZipOtherVenue'] === '[]', NOW['conflicts.usSameZipOtherVenue'])
  t('US, two venues in one ZIP code, overlapping times — BEFORE "review", AFTER "overlap" (one van, two places)',
    kinds(BEFORE['conflicts.usSameZipOtherVenueOverlap']) === 'review' && kinds(NOW['conflicts.usSameZipOtherVenueOverlap']) === 'overlap')
  t('US, the same venue in the same ZIP code — "duplicate", before and after', kinds(BEFORE['conflicts.usSameVenue']) === 'duplicate' && kinds(NOW['conflicts.usSameVenue']) === 'duplicate')

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · IE / AU / NZ / CA: the forms')
  const ctx = LP.context(kit, REPO)
  const { h, html, inManage, GB } = ctx
  const C = Object.fromEntries(Object.entries(COUNTRY).map(([k, c]) => [k, { ...GB, cc: c.countryCode, locale: c.locale, settings: { ...GB.settings, ...c }, truck: { ...GB.truck, country: c.countryCode } }]))
  C.gb = GB; C.us = ctx.US
  const A = await kit.bundle('af2-forms', [
    "export { EventAddressFields, CustomersSee, RegionInput, postalCodeForSave, regionCodeOf, placeSubline } from '@/components/manage/AddressFields'",
    "export { PlaceDetail } from '@/components/manage/SchedulePlaces'",
    "export { ADDRESS_FORMATS } from '@/lib/address-formats'",
    LP.PROVIDERS].join('\n'))
  const form = (k, v = {}) => html({}, inManage(A, C[k], h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3' }, h(A.EventAddressFields, {
    format: A.ADDRESS_FORMATS[k], venueName: v.venue ?? '', addressLabel: MSG.manageScheduleEvent.address, onChange: () => {},
    value: { address: '', town: v.town ?? '', suburb: v.suburb ?? '', region: v.region ?? '', postcode: v.postcode ?? '' },
  }))))
  const labels = s => [...s.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)].map(m => text(m[1]).replace(/ \*$/, "*"))
  const ie = form('ie'), au = form('au', { venue: 'Bondi Pavilion', town: 'Bondi Beach', region: 'nsw', postcode: '2026' }), nz = form('nz'), ca = form('ca')
  t('IE: Full address / Town or area* / County (dropdown, optional) / Eircode', JSON.stringify(labels(ie)) === JSON.stringify([MSG.manageScheduleEvent.address, 'Town or area*', 'County', 'Eircode']) && /data-region-select/.test(ie) && ie.includes('>Co. Kerry<'), labels(ie))
  t('AU: Full address / Suburb* / State or territory* (dropdown) / Postcode*', JSON.stringify(labels(au)) === JSON.stringify([MSG.manageScheduleEvent.address, 'Suburb*', 'State or territory*', 'Postcode*']) && /data-region-select/.test(au), labels(au))
  t('NZ: Full address / Suburb / Town or city* / Postcode — no region box', JSON.stringify(labels(nz)) === JSON.stringify([MSG.manageScheduleEvent.address, 'Suburb', 'Town or city*', 'Postcode']) && !/data-region-select/.test(nz), labels(nz))
  t('CA: Full address / City* / Province* (dropdown) / Postal code', JSON.stringify(labels(ca)) === JSON.stringify([MSG.manageScheduleEvent.address, 'City*', 'Province*', 'Postal code']) && /data-region-select/.test(ca), labels(ca))
  const see = s => text((s.match(/<p[^>]*data-customers-see[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '')
  t('"Customers see:" — the examples until something is typed (IE "People\'s Park, Limerick, Co. Limerick, D02 X963")', see(ie) === "Customers see: People's Park, Limerick, Co. Limerick, D02 X963", see(ie))
  t('"Customers see:" — what was typed, the format\'s line (AU "Bondi Pavilion, Bondi Beach NSW 2026")', see(au) === 'Customers see: Bondi Pavilion, Bondi Beach NSW 2026', see(au))
  t('NZ "Customers see:" shows the suburb ("Western Park, Ponsonby, Auckland 1011")', see(nz) === 'Customers see: Western Park, Ponsonby, Auckland 1011', see(nz))
  t('GB and US forms: no "Customers see:", no asterisk, no dropdown', ['gb', 'us'].every(k => { const s = form(k); return !/data-customers-see|data-region-select/.test(s) && !labels(s).some(l => l.endsWith('*')) }))
  t('GB form labels and placeholders as before (Area (village, town or city) · e.g. Wickhambrook · Postcode · e.g. CB8 8PD)', (() => { const s = form('gb'); return JSON.stringify(labels(s)) === JSON.stringify([MSG.manageScheduleEvent.address, 'Area (village, town or city)', 'Postcode']) && s.includes('placeholder="e.g. 123 High St, Wickhambrook"') && s.includes('placeholder="e.g. Wickhambrook"') && s.includes('placeholder="e.g. CB8 8PD"') })())
  t('US form: the State text box beside the ZIP code, as before (State · e.g. NJ · ZIP code · e.g. 78701; the 5.5rem grid)', (() => { const s = form('us'); return JSON.stringify(labels(s)) === JSON.stringify([MSG.manageScheduleEvent.address, 'City or town', 'State', 'ZIP code']) && s.includes('placeholder="e.g. NJ"') && s.includes('placeholder="e.g. 78701"') && s.includes('grid grid-cols-[5.5rem_1fr] gap-2') })(), labels(form('us')))

  head('3 · "NSW" round-trip, the Eircode tidy, the warning')
  t('AU dropdown: a stored "nsw" shows "NSW" selected; NSW is a whole option (no 2-letter box to cut it to "NS")', /<option value="NSW" selected="">NSW<\/option>/.test(au) && A.regionCodeOf(A.ADDRESS_FORMATS.au, 'nsw') === 'NSW', (au.match(/<option value="NSW"[^>]*>/) || [])[0])
  t('the text box (the US) is as long as the list\'s longest code: 2 for the US — and 3 would have been AU\'s', Math.max(...A.ADDRESS_FORMATS.us.regions.list.map(r => r.code.length)) === 2 && Math.max(...A.ADDRESS_FORMATS.au.regions.list.map(r => r.code.length)) === 3)
  t('"d02x963" → "D02 X963" on save (IE); GB and US saved as typed', A.postalCodeForSave(A.ADDRESS_FORMATS.ie, 'd02x963') === 'D02 X963' && A.postalCodeForSave(A.ADDRESS_FORMATS.gb, 'cb8 8pd') === 'cb8 8pd' && A.postalCodeForSave(A.ADDRESS_FORMATS.us, ' 07030') === ' 07030')
  const ieBad = form('ie', { postcode: 'D02 X96' }), ieOk = form('ie', { postcode: 'd02x963' })
  t('IE: a code without the Eircode shape warns (never blocks): "That doesn\'t look like an Eircode — for example D02 X963…"', text(ieBad).includes('That doesn’t look like an Eircode — for example D02 X963. You can still save it.') && !/data-postal-warning/.test(ieOk), text(ieBad).slice(0, 300))
  t('"NSW" displays on the card line and the picker subline: "Bondi Beach NSW 2026"', F.eventAreaLine({ town: 'Bondi Beach', region: 'NSW', postcode: '2026' }, 'au') === 'Bondi Beach NSW 2026'
    && A.placeSubline(A.ADDRESS_FORMATS.au, { town: 'Bondi Beach', region: 'NSW', postcode: '2026' }, 'x') === 'Bondi Beach NSW 2026' && A.placeSubline(A.ADDRESS_FORMATS.us, { town: 'Hoboken', region: 'NJ', postcode: '07030' }, 'Hoboken · 07030') === 'Hoboken · 07030')

  head('3 · the Places editor')
  const place = { id: 'p1', name: 'Bondi Pavilion', short_name: null, address: null, area: 'Bondi Beach', postcode: '2026', region: 'NSW', is_favourite: false, is_hidden: false }
  const pd = k => html({}, inManage(A, C[k], h(A.PlaceDetail, { place, api: async () => ({}), showToast: () => {}, onChanged: () => {} })))
  const pdAu = pd('au')
  t('AU Places editor: Suburb* / State or territory* dropdown (NSW selected) / Postcode* and "Customers see:"', labels(pdAu).includes('Suburb*') && labels(pdAu).includes('State or territory*') && labels(pdAu).includes('Postcode*') && /<option value="NSW" selected="">/.test(pdAu) && /data-customers-see/.test(pdAu), labels(pdAu))
  t('NZ Places editor has a Suburb field', labels(pd('nz')).includes('Suburb'))

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · Places and the trade area')
  const P = await kit.bundle('af2-places-lib', "export * from '@/lib/places'")
  const realFetch = globalThis.fetch
  process.env.GOOGLE_MAPS_API_KEY = 'address-formats-2-recorder'
  try {
    globalThis.fetch = async () => new Response(JSON.stringify(PLACE.au), { status: 200 })
    const d = await P.townDetails(PLACE.au.id, 'sess-1234567890', 'au')
    t('AU Places: a picked suburb stores the STATE ("New South Wales", code "NSW") — not the council', d.state === 'ok' && d.place.region === 'New South Wales' && d.place.regionCode === 'NSW', d)
    const calls = []
    globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ suggestions: [] }), { status: 200 }) }
    await P.suggestTowns('Bon', 'AU', 'sess-1234567890', globalThis.fetch, 'au')
    t('AU Places search asks for the format\'s town types (locality)', JSON.stringify(calls[0]?.includedPrimaryTypes) === '["locality"]', calls[0])
    globalThis.fetch = async () => new Response(JSON.stringify({ ...PLACE.au, addressComponents: [{ longText: 'Listowel', types: ['locality'] }, { longText: 'County Kerry', shortText: 'County Kerry', types: ['administrative_area_level_1'] }] }), { status: 200 })
    const di = await P.townDetails(PLACE.au.id, 'sess-1234567890', 'ie')
    t('IE Places: "County Kerry" stores its code "KY" (looked up in the county list)', di.place?.region === 'County Kerry' && di.place?.regionCode === 'KY', di)
  } finally { globalThis.fetch = realFetch; delete process.env.GOOGLE_MAPS_API_KEY }
  const auFacts = { ...COUNTRY.au, enabled: true }
  const tr = F.checkTradeArea({ base_place_name: 'Bondi Beach', base_place_id: 'ChIJ-au-bondibeach-00001', base_region: 'New South Wales', base_region_code: 'NSW', base_lat: -33.89, base_lng: 151.27 }, auFacts)
  t('trade area: AU "NSW" is accepted (in the list); "nsw" and "XYZ" are not (exact, app-side — the CHECK is dropped)', tr.ok && tr.values.base_region_code === 'NSW'
    && F.checkTradeArea({ base_place_name: 'Bondi Beach', base_place_id: 'ChIJ-au-bondibeach-00001', base_region_code: 'nsw', base_lat: -33.89, base_lng: 151.27 }, auFacts).values.base_region_code === null
    && F.checkTradeArea({ base_place_name: 'Bondi Beach', base_place_id: 'ChIJ-au-bondibeach-00001', base_region_code: 'XYZ', base_lat: -33.89, base_lng: 151.27 }, auFacts).values.base_region_code === null)
  t('before the SQL: "NSW" is held back from the main write and written after it (the old CHECK cannot fail the save); "NJ" is not split',
    JSON.stringify(F.splitRegionCodeWrite({ base_region_code: 'NSW' })) === JSON.stringify({ main: { base_region_code: null }, after: 'NSW' }) && F.splitRegionCodeWrite({ base_region_code: 'NJ' }).after === null)

  head('4 · the geocoder')
  const G = await kit.bundle('af2-geocode-after', "export { POST } from '@/app/api/manage/geocode/route'")
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const geo = async body => {
    const sent = []
    globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body).contents[0].parts[0].text); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"lat":1,"lng":2,"confidence":"high"}' }] } }] }), { status: 200 }) }
    try { await G.POST(new NextRequest('http://127.0.0.1/api/manage/geocode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })) } finally { globalThis.fetch = realFetch }
    return (sent[0] || '').match(/Location: "([^"]*)"/)?.[1]
  }
  const qAu = await geo({ venueName: 'Bondi Pavilion', town: 'Bondi Beach', postcode: '2026', country: 'Australia', addressFormat: 'au', region: 'nsw' })
  const qIe = await geo({ venueName: "People's Park", town: 'Limerick', postcode: 'V94 X2T6', country: 'Ireland', addressFormat: 'ie', region: 'LK' })
  const qNz = await geo({ venueName: 'Western Park', town: 'Auckland', suburb: 'Ponsonby', postcode: '1011', country: 'NZ', addressFormat: 'nz' })
  t('AU query from the template: "Bondi Pavilion, Bondi Beach NSW 2026, Australia"', qAu === 'Bondi Pavilion, Bondi Beach NSW 2026, Australia', qAu)
  t('IE query carries the county: "People\'s Park, Limerick, Co. Limerick, V94 X2T6, Ireland"', qIe === "People's Park, Limerick, Co. Limerick, V94 X2T6, Ireland", qIe)
  t('NZ query carries the suburb: "Western Park, Ponsonby, Auckland 1011, NZ"', qNz === 'Western Park, Ponsonby, Auckland 1011, NZ', qNz)

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the AI prompts')
  kit.setNow('2026-10-21T10:00:00Z')
  const X = await kit.bundle('af2-extract-after', "export * from '@/lib/schedule-extract'\nexport * as Shot from '@/lib/admin/screenshot-events'")
  const TS = { timeZone: 'Europe/Dublin', locale: 'en-IE', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
  for (const k of ['ie', 'au', 'nz', 'ca']) {
    const fmt = F.ADDRESS_FORMATS[k], name = COUNTRY[k].name
    const p = X.buildScheduleExtractionPrompt('Sat 25th Oct somewhere', TS, { countryName: name, countryCode: COUNTRY[k].countryCode, addressFormat: k })
    const s = X.Shot.buildScreenshotPrompt(new Date('2026-10-21T10:00:00Z'), { code: COUNTRY[k].countryCode, name, addressFormat: k, dateOrder: 'dmy' })
    t(`${k.toUpperCase()} importer prompt carries its own rules (${fmt.ai.importer.postalRules.split('\n')[0]}) and no UK postcode example`,
      p.includes(F.fillAiText(fmt.ai.importer.postalRules, { country: name, year: 2026 })) && p.includes(`knowledge of venues and locations in ${name}`) && !/CB25|CO10 7BQ|UK postcodes follow/.test(p))
    t(`${k.toUpperCase()} screenshot prompt carries its own location lines and JSON shape`, s.includes(fmt.ai.screenshot.locationLines) && s.includes(fmt.ai.screenshot.eventShape) && !/CB25 0BA/.test(s))
  }
  const auParsed = X.Shot.parseScreenshotEvents(JSON.stringify({ events: [{ 'DateStart': '25/10/2026', 'Truck Name': 'T', 'Venue Name': 'Bondi Pavilion', 'Village': 'Bondi Beach', 'State': 'nsw', 'Postcode': '2026' }] }), 'au')
  const ieParsed = X.Shot.parseScreenshotEvents(JSON.stringify({ events: [{ 'DateStart': '25/10/2026', 'Truck Name': 'T', 'Venue Name': 'Market Square', 'Village': 'Listowel', 'State': 'Co. Kerry', 'Postcode': '' }] }), 'ie')
  const usParsed = X.Shot.parseScreenshotEvents(JSON.stringify({ events: [{ 'DateStart': '25/10/2026', 'Truck Name': 'T', 'Venue Name': 'Pier A', 'Village': 'Hoboken', 'State': 'nj', 'Postcode': '07030' }] }))
  t('a screenshot\'s state is kept as the format\'s code: AU "nsw" → "NSW", IE "Co. Kerry" → "KY"; with no format, the old two-letter rule ("nj" → "NJ")',
    auParsed[0].state === 'NSW' && ieParsed[0].state === 'KY' && usParsed[0].state === 'NJ', [auParsed[0].state, ieParsed[0].state, usParsed[0].state])

  // ══ 6 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · event conflicts follow `identifiesPremises`')
  const EC = await kit.bundle('af2-ec-after', "export * from '@/lib/event-conflicts'")
  const ev = (id, venue, pc, s, e, status = 'confirmed') => ({ id, event_date: '2026-10-25', venue_name: venue, postcode: pc, start_time: s, end_time: e, status, van_id: null })
  const k2 = (fmt, a, b) => EC.detectEventConflicts(a, [a, b], fmt).map(c => c.kind).join(',')
  const auBefore = EC.detectEventConflicts(ev('c', 'Bondi Pavilion', '2026', '12:00', '14:00', 'unconfirmed'), [ev('x', 'Bondi Farmers Market', '2026', '17:00', '21:00')]).map(c => c.kind).join(',')
  t('AU, two venues in postcode 2026, different times — before (GB rule) "review", after none', auBefore === 'review' && k2('au', ev('c', 'Bondi Pavilion', '2026', '12:00', '14:00', 'unconfirmed'), ev('x', 'Bondi Farmers Market', '2026', '17:00', '21:00')) === '')
  t('AU, the same venue in 2026 at the same time — "duplicate"', k2('au', ev('c', 'Bondi Pavilion', '2026', '17:00', '21:00', 'unconfirmed'), ev('x', 'Bondi Pavilion', '2026', '17:00', '21:00')) === 'duplicate')
  t('IE (an Eircode is one premises): same Eircode, another name — still "review", as GB', k2('ie', ev('c', 'The Swan', 'V94 X2T6', '12:00', '14:00', 'unconfirmed'), ev('x', "People's Park", 'V94 X2T6', '17:00', '21:00')) === 'review')
  t('Manage passes the truck\'s format', read('app/manage/[token]/page.tsx').includes('detectEventConflicts(event, events, tabSettings.addressFormat)'))

  // ══ 7 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · the write paths and the columns — after the SQL, and before it')
  const mig = read('supabase/migrations/20261030_address_suburb_region.sql')
  t('the migration adds truck_events.suburb, truck_places.suburb and truck_places.region, and drops trucks_base_region_code_chk',
    /alter table public\.truck_events add column if not exists suburb text;/.test(mig) && /alter table public\.truck_places add column if not exists suburb text;/.test(mig)
    && /alter table public\.truck_places add column if not exists region text;/.test(mig) && /alter table public\.trucks drop constraint if exists trucks_base_region_code_chk;/.test(mig))
  const ACCESS = { file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: "const access = { ok: true as const, role: 'owner' as const, userId: null, operatorId: null, via: 'harness' } as any" }
  const R = await kit.bundle('af2-manage-route', "export { POST } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", {
    patches: [ACCESS],
    stubs: { '@/lib/supabase/server': 'export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: null }, error: null }) } } }' },
  })
  const CS = [snake(SEEDS.gbFromSeed()), snake(SEEDS.usFromSeed()), ...Object.values(COUNTRY).map(c => snake({ ...SEEDS.gbFromSeed(), ...c, enabled: true }))]
  const truckRow = cc => ({ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', dashboard_token: 'tok', operator_id: 'op-1', country: cc, timezone: 'Australia/Sydney', plan: 'pro', feature_overrides: {}, trial_expires_at: null, currency: 'AUD', contact_email: 'k@example.test' })
  const eventRow = { id: 'ev-1', truck_id: 'test-truck', venue_name: 'Bondi Pavilion', town: 'Bondi Beach', postcode: '2026', address: null, event_date: '2026-10-25', start_time: '17:00', end_time: '21:00', status: 'confirmed', van_id: null, region: null }
  const placeRow = { id: 'p1', truck_id: 'test-truck', name: 'Bondi Pavilion', name_key: 'bondi pavilion', area: 'Bondi Beach', postcode: '2026', is_hidden: false, is_favourite: false }
  const dbFor = (cc, missing) => {
    const db = makeFakePg({ country_settings: CS, trucks: [truckRow(cc)], truck_events: [{ ...eventRow }], truck_places: [{ ...placeRow }], operators: [{ id: 'op-1', auth_user_id: 'u-1', is_admin: false }], truck_users: [], audit_log: [], bundles_db: [], event_deals: [], slot_capacity: [], truck_vans: [] }, {})
    return missing ? preSqlDb(db, missing) : db
  }
  const rows = (db, tbl) => db.tables?.[tbl] || db[tbl] || []
  const post = async (db, body) => {
    globalThis.__harnessDb = db; R.clearCountrySettingsCache?.()
    const res = await kit.quietAsync(() => R.POST(new NextRequest('http://127.0.0.1/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok', ...body }) })))
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const editBody = { action: 'upsert_event', id: 'ev-1', venue_name: 'Bondi Pavilion', town: 'Bondi Beach', postcode: '2026', address: '', event_date: '2026-10-25', start_time: '17:00', end_time: '21:00', notes: '' }
  {
    const db = dbFor('AU')
    const r = await post(db, { ...editBody, region: 'nsw' })
    t('AU event saved with region "nsw" → stored "NSW" (the truck\'s format\'s list)', r.status === 200 && rows(db, 'truck_events')[0].region === 'NSW', { status: r.status, body: JSON.stringify(r.body).slice(0, 300), row: rows(db, 'truck_events')[0] })
  }
  {
    const db = dbFor('NZ')
    const r = await post(db, { ...editBody, suburb: ' Ponsonby ' })
    t('NZ event saved with a suburb → stored "Ponsonby"', r.status === 200 && rows(db, 'truck_events')[0].suburb === 'Ponsonby', { status: r.status, row: rows(db, 'truck_events')[0] })
  }
  {
    const db = dbFor('NZ', { truck_events: ['suburb'], truck_places: ['suburb', 'region'] })
    const r = await post(db, { ...editBody, suburb: 'Ponsonby', town: 'Auckland' })
    t('BEFORE THE SQL: the NZ event still saves (200, town written) — only the suburb is lost', r.status === 200 && rows(db, 'truck_events')[0].town === 'Auckland' && rows(db, 'truck_events')[0].suburb === undefined, { status: r.status, body: JSON.stringify(r.body).slice(0, 200) })
  }
  {
    const db = dbFor('AU')
    const r = await post(db, { action: 'sg_upsert_place', id: 'p1', region: 'nsw' })
    const r2 = await post(db, { action: 'sg_upsert_place', id: 'p1', area: 'Bondi', suburb: '' })
    t('AU Places editor: region "nsw" → truck_places.region "NSW", in its own update', r.status === 200 && rows(db, 'truck_places')[0].region === 'NSW' && r2.status === 200 && rows(db, 'truck_places')[0].area === 'Bondi', rows(db, 'truck_places')[0])
  }
  {
    const db = dbFor('AU', { truck_events: ['suburb'], truck_places: ['suburb', 'region'] })
    const r = await post(db, { action: 'sg_upsert_place', id: 'p1', area: 'Bondi', region: 'NSW' })
    t('BEFORE THE SQL: a Places edit with a region still saves the area (200); the region alone is lost', r.status === 200 && rows(db, 'truck_places')[0].area === 'Bondi', r)
  }
  {
    const db = dbFor('AU', {})
    preSqlDb(db, {}, { regionCheck: true })
    const r = await post(db, { action: 'update_trade_area', base_place_name: 'Bondi Beach', base_place_id: 'ChIJ-au-bondibeach-00001', base_region: 'New South Wales', base_region_code: 'NSW', base_lat: -33.89, base_lng: 151.27, timezone: 'Australia/Sydney' })
    t('BEFORE THE SQL: an AU "Where you trade" save with "NSW" succeeds (the old CHECK refuses only the separate code write)', r.status === 200 && rows(db, 'trucks')[0].base_place_name === 'Bondi Beach' && rows(db, 'trucks')[0].base_region_code == null, { status: r.status, body: JSON.stringify(r.body).slice(0, 200) })
    const db2 = dbFor('AU')
    const r2 = await post(db2, { action: 'update_trade_area', base_place_name: 'Bondi Beach', base_place_id: 'ChIJ-au-bondibeach-00001', base_region: 'New South Wales', base_region_code: 'NSW', base_lat: -33.89, base_lng: 151.27, timezone: 'Australia/Sydney' })
    t('AFTER THE SQL: the same save stores base_region_code "NSW"', r2.status === 200 && rows(db2, 'trucks')[0].base_region_code === 'NSW', rows(db2, 'trucks')[0])
  }
  {
    const db = dbFor('AU', { truck_places: ['suburb', 'region'] })
    const r = await post(db, { action: 'sg_places' })
    t('BEFORE THE SQL: the Places list still loads, with no suburb/region keys', r.status === 200 && Array.isArray(r.body?.places) && r.body.places.length === 1 && !('region' in r.body.places[0]), JSON.stringify(r.body).slice(0, 300))
  }
  t('signup: each country carries its address format (the step\'s town label follows it: AU "Suburb you’re based in")',
    read('lib/signup-countries.ts').includes('addressFormat: c.addressFormat,') && read('components/setup/WhereBasedStep.tsx').includes("tAddr(`basedIn.${") && MSG.address.basedIn.suburb === 'Suburb you’re based in' && MSG.address.basedIn.area === 'Town or city you’re based in')
  t('a format written as codes keeps only a code: US "nj" → "NJ", "New Jersey" → none (as the two-letter rule); IE (names) "Kerry" → "KY"',
    F.normaliseRegion('nj', 'us') === 'NJ' && F.normaliseRegion('New Jersey', 'us') === null && F.normaliseRegion('nsw', 'au') === 'NSW' && F.normaliseRegion('Kerry', 'ie') === 'KY' && F.normaliseRegion('XX', 'us') === null)
  const M = read('app/manage/[token]/page.tsx')
  t('GB/US saves send no new key: the suburb only from a format with the field, the postal code tidied only where the format checks',
    M.includes("suburb: fieldOf(addrFormat, 'suburb') ? (editingEvent.suburb ?? '') : undefined,") && M.includes("...(addrFormat.entry.postalCheck ? { postcode: postalCodeForSave(addrFormat, editingEvent.postcode) } : {}),")
    && M.includes("region: fieldOf(addrFormat, 'region') ? normaliseRegion(editingEvent.region, addrFormat.key) : undefined,"))
}
