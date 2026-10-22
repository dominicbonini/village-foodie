// scripts/_address-formats-1-after.cjs — the checks of scripts/address-formats-1.cjs that need this stage's code (the
// `--capture` run, on the code before it, never loads this file). A MODULE.
const fs = require('fs'); const path = require('path')
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

module.exports = async function after({ kit, t, head, read, REPO, snapshot, SNAP_FILE, mailBase, card }) {
  const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
  const F = await kit.bundle('af1-config', "export * from '@/lib/address-formats'\nexport * as EA from '@/lib/event-address'\nexport { mapCountryRow } from '@/lib/country-settings'\nexport * as Form from '@/lib/admin/country-form'")

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the config (lib/address-formats.ts)')
  t(`six formats: ${F.ADDRESS_FORMAT_KEYS.join(', ')}`, JSON.stringify(F.ADDRESS_FORMAT_KEYS) === JSON.stringify(['gb', 'us', 'ie', 'au', 'nz', 'ca']))
  const problems = F.validateAddressFormats()
  t('the validator finds nothing: every pattern compiles and matches its own example, every template token exists and has a field, every region list is well formed', problems.length === 0, problems)
  const broken = { ...F.ADDRESS_FORMATS, gb: { ...F.ADDRESS_FORMATS.gb, postalCode: { ...F.ADDRESS_FORMATS.gb.postalCode, pattern: '([' }, templates: { ...F.ADDRESS_FORMATS.gb.templates, line: { sep: ', ', parts: ['{venue}', '{county}'] } } } }
  const bp = F.validateAddressFormats(broken)
  t('…and it does catch a bad pattern and an unknown token (it can fail)', bp.some(p => /does not compile/.test(p)) && bp.some(p => /unknown template token \{county\}/.test(p)), bp)
  const n = k => F.ADDRESS_FORMATS[k].regions?.list.length ?? 0
  t(`region lists: US ${n('us')} (50 states + DC), Ireland ${n('ie')} counties, Australia ${n('au')}, Canada ${n('ca')}; none for GB or NZ`,
    n('us') === 51 && n('ie') === 26 && n('au') === 8 && n('ca') === 13 && !F.ADDRESS_FORMATS.gb.regions && !F.ADDRESS_FORMATS.nz.regions)
  const norm = (k, s) => F.normalisePostalCode(F.ADDRESS_FORMATS[k], s)
  t('normalisers: "cb88pd" → "CB8 8PD", "d02x963" → "D02 X963", " 2026 " → "2026", "78701 - 1234" → "78701-1234", "m5v3l9" → "M5V 3L9"',
    norm('gb', 'cb88pd') === 'CB8 8PD' && norm('ie', 'd02x963') === 'D02 X963' && norm('au', ' 2026 ') === '2026' && norm('us', '78701 - 1234') === '78701-1234' && norm('ca', 'm5v3l9') === 'M5V 3L9')
  t('postal patterns: valid and invalid examples per format',
    F.isValidPostalCode(F.ADDRESS_FORMATS.gb, 'co10 7bq') && !F.isValidPostalCode(F.ADDRESS_FORMATS.gb, '2026') && F.isValidPostalCode(F.ADDRESS_FORMATS.ie, 'V94 X2T6')
    && !F.isValidPostalCode(F.ADDRESS_FORMATS.ie, 'CB8 8PD') && F.isValidPostalCode(F.ADDRESS_FORMATS.au, '2026') && !F.isValidPostalCode(F.ADDRESS_FORMATS.au, '20261')
    && F.isValidPostalCode(F.ADDRESS_FORMATS.ca, 'K1A 0B1') && !F.isValidPostalCode(F.ADDRESS_FORMATS.ca, 'D02 X963') && F.isValidPostalCode(F.ADDRESS_FORMATS.us, '07030'))
  t('a postal code identifies one premises only in GB and Ireland', F.ADDRESS_FORMAT_KEYS.filter(k => F.ADDRESS_FORMATS[k].postalCode.identifiesPremises).join() === 'gb,ie')
  // ⚠️ RE-PINNED (address-formats-2, 21 October 2026): the prompts READ these lines from the config now, so they are no
  // longer in the prompt files' source; scripts/address-formats-2.cjs compares the whole GB and US prompts, byte for byte,
  // against a capture of the code before. Here: GB's postcode rules and screenshot lines are still the old text.
  t("GB's AI lines are TODAY'S prompt lines, verbatim (now in the config's `ai` slots)",
    F.ADDRESS_FORMATS.gb.ai.importer.postalRules.startsWith('POSTCODE RULES:\n- UK postcodes follow the format: letters+numbers SPACE number+letters (e.g. "CB25 0BA", "CO10 7BQ", "PE28 2SB")')
    && F.ADDRESS_FORMATS.gb.ai.screenshot.locationLines.endsWith('- UK postcodes look like "CB25 0BA", "CO10 7BQ", "PE28 2SB". If no postcode is shown, use "".'))
  t('no country code decides an address anywhere in the config: no "GB"/"US"/… comparisons', !/===\s*'(GB|US|IE|AU|NZ|CA)'|countryCode/.test(read('lib/address-formats.ts').replace(/\/\/[^\n]*/g, '')))

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the country row: the CHECK = the keys; legacy values accepted; an unknown value refused')
  const mig = read('supabase/migrations/20261028_address_formats.sql')
  const chk = (mig.match(/check \(address_format in \(([^)]*)\)\)/) || [])[1]
  const chkKeys = chk ? [...chk.matchAll(/'([a-z_]+)'/g)].map(m => m[1]) : null
  t(`the migration's CHECK lists exactly the config's keys, in order (${chkKeys?.join(', ')})`, JSON.stringify(chkKeys) === JSON.stringify(F.ADDRESS_FORMAT_KEYS), chk)
  t('the migration maps the legacy values (postcode → gb, zip_state → us; IE/AU/NZ to their own) before adding the CHECK, and drops the old CHECK first',
    mig.indexOf("drop constraint if exists country_settings_address_format_chk") < mig.indexOf("set address_format = 'gb'") && mig.indexOf("set address_format = 'nz'") < mig.indexOf('add constraint country_settings_address_format_chk')
    && ['GB', 'US', 'IE', 'AU', 'NZ'].every(c => mig.includes(`where country_code = '${c}'`)))
  const gbRow = snake(SEEDS.gbFromSeed()), usRow = snake(SEEDS.usFromSeed())
  const fmtOf = v => { try { return F.mapCountryRow({ ...gbRow, address_format: v }).addressFormat } catch (e) { return 'THROWS: ' + e.message.slice(0, 60) } }
  t(`the loader reads the legacy values as their format: 'postcode' → ${fmtOf('postcode')}, 'zip_state' → ${fmtOf('zip_state')}`, fmtOf('postcode') === 'gb' && fmtOf('zip_state') === 'us')
  t(`…and every key as itself (${F.ADDRESS_FORMAT_KEYS.map(fmtOf).join(', ')})`, F.ADDRESS_FORMAT_KEYS.every(k => fmtOf(k) === k))
  t(`an unknown value is refused, like an unusable currency (a list skips the row; Admin › Countries names it): ${fmtOf('suburb_state')}`, fmtOf('suburb_state').startsWith('THROWS') && fmtOf('').startsWith('THROWS'))
  t('the seed rows are legacy values today (GB postcode, US zip_state) and still load', gbRow.address_format === 'postcode' && usRow.address_format === 'zip_state' && F.mapCountryRow(usRow).addressFormat === 'us')
  t('the stored → format lookup maps keys and legacy values, and nothing else', F.addressFormatKeyOf('postcode') === 'gb' && F.addressFormatKeyOf('zip_state') === 'us'
    && F.addressFormatKeyOf('au') === 'au' && F.addressFormatKeyOf('AU') === null && F.addressFormatKeyOf(null) === null)
  // ⚠️ RE-PINNED (address-formats-2, 21 October 2026): stage 2 moved the labels onto each format's field types and variants
  // (messages `address.*`), so `messagesStyle` / `messagesStyleOf` are gone. What this pinned — GB and US words unchanged —
  // is now each format's postal label variant, and the GB/US words are byte-identical (scripts/address-formats-2.cjs).
  t("each format's postal label variant: GB/AU/NZ 'postcode', US 'zip', IE 'eircode', CA 'postalCode'",
    F.ADDRESS_FORMAT_KEYS.map(k => F.postalLabelOf(F.ADDRESS_FORMATS[k])).join() === 'postcode,zip,eircode,postcode,postcode,postalCode' && typeof F.messagesStyleOf === 'undefined')
  const tab = read('components/admin/CountriesTab.tsx'), form = read('lib/admin/country-form.ts')
  t('Admin › Countries: the address field is a dropdown of the config\'s formats ("United Kingdom — postcode", "Ireland — Eircode", …)',
    /choice\(code, 'addressFormat', ADDRESS_FORMAT_KEYS\.map\(k => \[k, ADDRESS_FORMATS\[k\]\.adminLabel\]\)\)/.test(tab) && F.ADDRESS_FORMATS.ie.adminLabel === 'Ireland — Eircode' && F.ADDRESS_FORMATS.au.adminLabel === 'Australia — suburb, state, postcode')
  t('…and the form refuses anything that is not a key', /if \(!isAddressFormatKey\(f\.addressFormat\)\) err\('addressFormat'/.test(form))
  t('addressStyleOf is retired: no caller left', !/addressStyleOf\(/.test(['app/manage/[token]/page.tsx', 'components/manage/SchedulePlaces.tsx', 'lib/copy/addressPlaceholders.ts'].map(read).join('\n')))

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · GB and US byte-identical to the snapshot of the old code')
  const before = JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8')).outputs
  const now = await snapshot()
  // The Add-event preview's event OBJECT gains the format key (it carries it to the card): the card's HTML is compared
  // byte for byte, and the object with that one key set aside.
  const comparable = (k, v) => {
    if (!k.startsWith('preview.') || typeof v !== 'string') return v
    const nl = v.indexOf('\n'); const obj = JSON.parse(v.slice(0, nl)); delete obj.addressFormat
    return JSON.stringify(obj) + v.slice(nl)
  }
  const groups = {}
  for (const k of Object.keys(before)) {
    const g = k.split('.').slice(0, k.startsWith('mail.') ? 2 : 1).join('.')
    ;(groups[g] ||= []).push(k)
  }
  for (const [g, keys] of Object.entries(groups)) {
    const diff = keys.filter(k => comparable(k, now[k]) !== before[k])
    t(`${g}: ${keys.length} GB/US outputs identical`, diff.length === 0, diff.slice(0, 3).map(k => ({ k, before: String(before[k]).slice(0, 160), now: String(now[k]).slice(0, 160) })))
  }
  t('…and nothing in the snapshot went missing', Object.keys(before).every(k => k in now))
  const { PARTS } = arguments[0]
  const manageCard = ['gb', 'us'].flatMap(cc => PARTS[cc].map(p => [cc, p])).filter(([cc, p]) => F.EA.eventAreaLine({ town: p.town, postcode: p.postcode }, cc) !== [p.town, p.postcode].filter(Boolean).join(' · '))
  t("Manage › Schedule's card line 2 (no state passed): GB and US read exactly the old `[town, postcode].join(' · ')`", manageCard.length === 0, manageCard)
  t('…and Manage passes the format to it', /eventAreaLine\(\{ town: event\.town, postcode: event\.postcode \}, tabSettings\.addressFormat\)/.test(read('app/manage/[token]/page.tsx')))

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · Ireland, Australia, New Zealand, Canada — the lines from their formats')
  const L = (p, f) => F.EA.eventAddressLine(p, f)
  const FIX = {
    ie: [{ venueName: "People's Park", town: 'Limerick', postcode: 'V94 X2T6' }, "People's Park, Limerick, V94 X2T6"],
    ieCounty: [{ venueName: 'Lartigue Monorail', town: 'Listowel', region: 'Kerry', postcode: 'V31 F2K4' }, 'Lartigue Monorail, Listowel, Co. Kerry, V31 F2K4'],
    au: [{ venueName: 'Bondi Pavilion', town: 'Bondi Beach', region: 'NSW', postcode: '2026' }, 'Bondi Pavilion, Bondi Beach NSW 2026'],
    auName: [{ venueName: 'Federation Square', town: 'Melbourne', region: 'victoria', postcode: '3000' }, 'Federation Square, Melbourne VIC 3000'],
    nz: [{ venueName: 'Western Park', suburb: 'Ponsonby', town: 'Auckland', postcode: '1011' }, 'Western Park, Ponsonby, Auckland 1011'],
    ca: [{ venueName: 'Trinity Bellwoods Park', town: 'Toronto', region: 'ON', postcode: 'M5V 3L9' }, 'Trinity Bellwoods Park, Toronto, ON M5V 3L9'],
  }
  for (const [k, [p, want]] of Object.entries(FIX)) {
    const f = k.replace(/[A-Z].*$/, '')
    t(`${f.toUpperCase()}: "${want}"`, L(p, f) === want, L(p, f))
  }
  t('a region outside the format\'s list is dropped, never printed raw: AU "XYZ" → "Bondi Pavilion, Bondi Beach 2026"', L({ ...FIX.au[0], region: 'XYZ' }, 'au') === 'Bondi Pavilion, Bondi Beach 2026')
  t('normaliseRegion reads the format\'s own list: NSW / vic → NSW / VIC (au), "Co. Kerry" → KY (ie), NSW → null (us), ON → ON (ca)',
    F.EA.normaliseRegion('NSW', 'au') === 'NSW' && F.EA.normaliseRegion('vic', 'au') === 'VIC' && F.EA.normaliseRegion('Co. Kerry', 'ie') === 'KY'
    && F.EA.normaliseRegion('NSW', 'us') === null && F.EA.normaliseRegion('ON', 'ca') === 'ON' && F.EA.normaliseRegion('NJ', 'gb') === null)
  t('…and with no format, the old rule exactly (two letters, upper-cased): "nj" → NJ, "NSW" → null', F.EA.normaliseRegion('nj') === 'NJ' && F.EA.normaliseRegion('NSW') === null)
  const area = (p, f) => F.EA.eventAreaLine(p, f)
  t('card area lines: AU "Bondi Beach NSW 2026", IE "Limerick · V94 X2T6", NZ "Ponsonby, Auckland 1011", CA "Toronto, ON M5V 3L9"',
    area({ town: 'Bondi Beach', region: 'NSW', postcode: '2026' }, 'au') === 'Bondi Beach NSW 2026' && area({ town: 'Limerick', postcode: 'V94 X2T6' }, 'ie') === 'Limerick · V94 X2T6'
    && area({ suburb: 'Ponsonby', town: 'Auckland', postcode: '1011' }, 'nz') === 'Ponsonby, Auckland 1011' && area({ town: 'Toronto', region: 'ON', postcode: 'M5V 3L9' }, 'ca') === 'Toronto, ON M5V 3L9')
  const M = await kit.bundle('af1-mail-on', "export * as Mail from '@/lib/email'")
  for (const [f, k, money, time] of [['ie', 'ie', { currency: 'EUR', locale: 'en-IE' }, { timeZone: 'Europe/Dublin', locale: 'en-IE', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }],
    ['au', 'au', { currency: 'AUD', locale: 'en-AU' }, { timeZone: 'Australia/Sydney', locale: 'en-AU', timeFormat: '12h', dateOrder: 'dmy', weekStart: 'monday' }],
    ['ca', 'ca', { currency: 'CAD', locale: 'en-CA' }, { timeZone: 'America/Toronto', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }]]) {
    const [p, want] = FIX[k]
    const mail = M.Mail.formatConfirmationEmail({ ...mailBase('gb'), money, time, phoneCountry: f.toUpperCase(), addressFormat: f, venueName: p.venueName, venueTown: p.town, venueRegion: p.region, venuePostcode: p.postcode })
    t(`${f.toUpperCase()} confirmation email: "📍 ${want}"`, mail.text.includes(`📍 ${want}`) || mail.html.includes(`📍 ${want.replace(/'/g, '&#x27;')}`) || mail.html.includes(`📍 ${want}`), mail.text.slice(0, 400))
  }
  const C = await kit.bundle('af1-card-on', "export { default } from '@/components/TruckListCard'", { stubs: { 'posthog-js/react': 'export const usePostHog = () => null' } })
  const cardText = ev => kit.renderStatic(kit.h(C.default, { event: ev, slug: 'x' })).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
  t('AU card: "Bondi Beach NSW 2026" under the venue', cardText(card('au', { venueName: 'Bondi Pavilion', village: 'Bondi Beach', region: 'NSW', postcode: '2026' })).includes('Bondi Beach NSW 2026'))
  t('IE card: "Limerick · V94 X2T6"', cardText(card('ie', { venueName: "People's Park", village: 'Limerick', postcode: 'V94 X2T6' })).includes('Limerick · V94 X2T6'))
  t('CA card: "Toronto, ON M5V 3L9"', cardText(card('ca', { venueName: 'Trinity Bellwoods Park', village: 'Toronto', region: 'ON', postcode: 'M5V 3L9' })).includes('Toronto, ON M5V 3L9'))
  t('a card with NO format (an older payload) keeps the old rule: AU-shaped event reads "Bondi Beach · 2026"', cardText(card(undefined, { venueName: 'Bondi Pavilion', village: 'Bondi Beach', region: 'NSW', postcode: '2026', addressFormat: undefined })).includes('Bondi Beach · 2026'))

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the feeds carry each event\'s format, and read its region in it')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const auRow = { ...gbRow, country_code: 'AU', name: 'Australia', short_name: 'Australia', currency: 'AUD', locale: 'en-AU', address_format: 'au', default_timezone: 'Australia/Sydney', timezones: ['Australia/Sydney'] }
  const CS = [gbRow, usRow, auRow]
  const truck = (id, name, slug, cc) => ({ id, name, slug, country: cc, timezone: cc === 'US' ? 'America/New_York' : cc === 'AU' ? 'Australia/Sydney' : 'Europe/London', active: true, excluded: false,
    show_on_vf: true, show_on_hg: true, order_link_vf: false, order_link_hg: true, embed_enabled: true, cuisine_type: 'Pizza', logo_storage_path: null, cover_image_path: null,
    contact_phone: null, website: null, social_instagram: null, social_facebook: null, phone_is_whatsapp: false })
  const T = { gb: truck('t-gb', 'Fenland Fryer', 'fenland-fryer', 'GB'), us: truck('t-us', 'Hoboken Slice', 'hoboken-slice', 'US'), au: truck('t-au', 'Bondi Bites', 'bondi-bites', 'AU') }
  const ev = (id, tr, venue, town, postcode, region) => ({ id, truck_id: tr.id, event_date: '2026-10-25', start_time: '11:30:00', end_time: '20:00:00', venue_name: venue, town, postcode, region,
    latitude: null, longitude: null, notes: null, status: 'confirmed', is_private: false, venue_id: null, truck_place_id: null, trucks: tr })
  const world = () => ({ trucks: Object.values(T), truck_events: [ev('ev-gb', T.gb, 'The Green', 'Wickhambrook', 'CB8 8XX', null), ev('ev-us', T.us, 'Pier A Park', 'Hoboken', '07030', 'NJ'),
    ev('ev-au', T.au, 'Bondi Pavilion', 'Bondi Beach', '2026', 'NSW'), ev('ev-au-junk', T.au, 'Coogee Beach', 'Coogee', '2034', 'XYZ')], discovery_trucks: [], discovery_events: [], venues: [], country_settings: CS })
  const bundleRoute = (tag, route) => kit.bundle(tag, `export { GET } from '@/${route}'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'`)
  const R = { events: await bundleRoute('af1-events', 'app/api/events/route'), embed: await bundleRoute('af1-embed', 'app/api/embed/events/route'), disc: await bundleRoute('af1-disc', 'app/api/discovery/events/route') }
  const get = async (M, url, host = 'www.hatchgrab.com') => { globalThis.__harnessDb = makeFakePg(world()); M.clearCountrySettingsCache?.(); return (await kit.quietAsync(() => M.GET(new NextRequest(url, { headers: { host } })))).json() }
  const pick = (j, id) => (j.events || []).find(e => e.id === id) || {}
  const evGb = await get(R.events, 'https://www.hatchgrab.com/api/events?truck=fenland-fryer'), evAu = await get(R.events, 'https://www.hatchgrab.com/api/events?truck=bondi-bites')
  t('/api/events: a GB truck\'s events carry "gb" (the legacy row value mapped), an AU truck\'s "au" with region "NSW" kept and "XYZ" dropped',
    pick(evGb, 'ev-gb').addressFormat === 'gb' && pick(evAu, 'ev-au').addressFormat === 'au' && pick(evAu, 'ev-au').region === 'NSW' && !('region' in pick(evAu, 'ev-au-junk')),
    { gb: pick(evGb, 'ev-gb'), au: pick(evAu, 'ev-au'), junk: pick(evAu, 'ev-au-junk') })
  const emUs = await get(R.embed, 'https://www.hatchgrab.com/api/embed/events?slug=hoboken-slice')
  t('/api/embed/events: the US truck\'s event carries "us" and region "NJ"', pick(emUs, 'ev-us').addressFormat === 'us' && pick(emUs, 'ev-us').region === 'NJ', pick(emUs, 'ev-us'))
  const dh = await get(R.disc, 'https://www.hatchgrab.com/api/discovery/events')
  t('/api/discovery/events (HatchGrab): each operator event its own truck\'s format — GB "gb", US "us" with NJ, AU "au" with NSW',
    pick(dh, 'ev-gb').addressFormat === 'gb' && pick(dh, 'ev-us').addressFormat === 'us' && pick(dh, 'ev-us').region === 'NJ' && pick(dh, 'ev-au').addressFormat === 'au' && pick(dh, 'ev-au').region === 'NSW',
    (dh.events || []).map(e => [e.id, e.addressFormat, e.region]))
}
