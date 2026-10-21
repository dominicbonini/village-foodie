// lib/address-formats.ts — 🔴 THE ADDRESS FORMATS. THE ONE PLACE A COUNTRY'S ADDRESS SHAPE LIVES. Client-safe: pure data and
// pure helpers, no I/O.
//
// address-formats-1 (21 October 2026, docs/address-formats-1-report.md; design in docs/address-formats-diagnosis-report.md
// §2, as amended by Dominic on 21 Oct): a BACKEND CONFIG, like lib/currencies.ts. Admin › Countries only PICKS which
// format a country uses (`country_settings.address_format` holds one of these keys; the database CHECK lists exactly
// them — scripts/address-formats-1.cjs proves it). Nothing here is edited field by field in admin.
//
// 🔴 NO COUNTRY-CODE BRANCHES ANYWHERE. Behaviour comes from the format: which fields, which label word, which region
// list, how a postal code looks and is tidied, how a line is written, how Places and the AI read it. A new country picks
// an existing format or adds one entry here.
//
// ── WHAT READS IT TODAY (stage 1) ──────────────────────────────────────────────────────────────────────────────────
// Every DISPLAY: lib/event-address.ts (emails, event cards, the calendar line, WhatsApp prompts, the Add-event preview).
// Entry forms, geocoding, Places, the AI prompts and event-conflicts still read `messagesStyle` / their own rules until
// stage 2 moves them onto `fields`, `places`, `ai` and `postalCode.identifiesPremises`.
//
// ── WORDS ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Field LABELS are not here: the words live in messages/, keyed by field type and the variant named below (postcode /
// eircode / zip / postalCode; state / stateTerritory / province / county; townOrArea / city / suburb / townOrCity), so
// they translate. Until stage 2 moves the labels, the existing `{style, select, zip_state {…} other {…}}` messages are
// fed `messagesStyle`. Examples, patterns, region names and templates ARE here: they are facts about a country's
// addresses ("CB8 8PD" is the same in every language), not words to translate.

export type AddressFormatKey = 'gb' | 'us' | 'ie' | 'au' | 'nz' | 'ca'
/** The two values `country_settings.address_format` held before this stage. Still accepted (see `addressFormatKeyOf`)
 *  so a deploy is safe before the "run after deploy" SQL maps them. */
export type LegacyAddressStyle = 'postcode' | 'zip_state'

export type AddressFieldKey = 'street' | 'suburb' | 'locality' | 'region' | 'postalCode'
export type PostalLabel = 'postcode' | 'eircode' | 'zip' | 'postalCode'
export type RegionLabel = 'state' | 'stateTerritory' | 'province' | 'county'
export type LocalityLabel = 'townOrArea' | 'city' | 'suburb' | 'townOrCity'
export type FieldLabel = PostalLabel | RegionLabel | LocalityLabel | 'street'
export type PostalNormaliser = 'gb' | 'eircode' | 'digits' | 'zip' | 'ca' | 'none'

export interface AddressField { key: AddressFieldKey; required: boolean; label: FieldLabel }
export interface Region { code: string; name: string; aliases?: readonly string[] }
/** A line: the parts are joined by `sep`; a part whose tokens are all empty is dropped; spaces collapse.
 *  `requires`: an alternative used only when those tokens have a value (the first alternative that qualifies wins). */
export interface AddressTemplate { sep: string; parts: readonly string[]; requires?: readonly TemplateToken[] }
export type TemplateToken = 'venue' | 'street' | 'suburb' | 'locality' | 'region' | 'postalCode' | 'country'
export const TEMPLATE_TOKENS: readonly TemplateToken[] = ['venue', 'street', 'suburb', 'locality', 'region', 'postalCode', 'country']

export interface AddressFormat {
  key: AddressFormatKey
  /** Admin › Countries' dropdown. Admin-only English, like the registry's currency names. */
  adminLabel: string
  /** The ordered fields, as a form shows them (stage 2). */
  fields: readonly AddressField[]
  regions: { list: readonly Region[]; shownAs: 'code' | 'name' } | null
  postalCode: {
    /** Checked after normalising. Warn-only on entry at first (stage 2). */
    pattern: string
    normaliser: PostalNormaliser
    example: string
    /** True when one postal code is one address (GB, Eircode). False when it covers a whole area — a ZIP, an AU/NZ
     *  4-digit code — so "same postcode" must never mean "same venue" (lib/event-conflicts.ts, stage 2). */
    identifiesPremises: boolean
  }
  /** Placeholders for the entry forms (stage 2). */
  examples: { venue: string; street: string; locality: string; suburb?: string; region?: string }
  templates: {
    /** One line: emails, WhatsApp prompts. Callers leave out the postal code where a line never had one. */
    line: AddressTemplate
    /** Under the venue on an event card. Alternatives, first that qualifies. */
    area: readonly AddressTemplate[]
    /** The calendar invite's location. */
    calendar: AddressTemplate
    /** What the geocoder is asked (stage 2). */
    geocode: AddressTemplate
  }
  /** Google Places mapping (stage 2): which result types are a town, and where the region comes from. */
  places: { localityTypes: readonly string[]; regionFrom: 'administrative_area_level_1' | 'administrative_area_level_2' | null; regionAs: 'long' | 'short' }
  /** The AI prompt rules (stage 2). GB's are TODAY'S prompt lines, verbatim (scripts/address-formats-1.cjs checks). */
  ai: { importerPostalRules: string; screenshotLocationLines: string }
  /** The ICU `{style}` branch the existing messages use until stage 2 moves the labels: GB/US words are unchanged. */
  messagesStyle: LegacyAddressStyle
}

// ── Region lists ──────────────────────────────────────────────────────────────────────────────────────────────────
const US_STATES: readonly Region[] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'],
  ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([code, name]) => ({ code, name }))

// ISO 3166-2:IE county codes without "IE-". Shown by name ("Co. Kerry"); typed as the code, "Kerry" or "County Kerry".
const IE_COUNTIES: readonly Region[] = [
  ['CW', 'Carlow'], ['CN', 'Cavan'], ['CE', 'Clare'], ['CO', 'Cork'], ['DL', 'Donegal'], ['D', 'Dublin'], ['G', 'Galway'],
  ['KY', 'Kerry'], ['KE', 'Kildare'], ['KK', 'Kilkenny'], ['LS', 'Laois'], ['LM', 'Leitrim'], ['LK', 'Limerick'], ['LD', 'Longford'],
  ['LH', 'Louth'], ['MO', 'Mayo'], ['MH', 'Meath'], ['MN', 'Monaghan'], ['OY', 'Offaly'], ['RN', 'Roscommon'], ['SO', 'Sligo'],
  ['TA', 'Tipperary'], ['WD', 'Waterford'], ['WH', 'Westmeath'], ['WX', 'Wexford'], ['WW', 'Wicklow'],
].map(([code, county]) => ({ code, name: `Co. ${county}`, aliases: [county, `County ${county}`, `Co ${county}`] }))

const AU_STATES: readonly Region[] = [
  ['NSW', 'New South Wales'], ['VIC', 'Victoria'], ['QLD', 'Queensland'], ['SA', 'South Australia'], ['WA', 'Western Australia'],
  ['TAS', 'Tasmania'], ['NT', 'Northern Territory'], ['ACT', 'Australian Capital Territory'],
].map(([code, name]) => ({ code, name }))

const CA_PROVINCES: readonly Region[] = [
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'], ['NL', 'Newfoundland and Labrador'],
  ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'],
  ['QC', 'Quebec'], ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
].map(([code, name]) => ({ code, name }))

// ── GB's AI lines — TODAY'S PROMPTS, VERBATIM (lib/schedule-extract.ts, lib/admin/screenshot-events.ts) ──────────────
const GB_IMPORTER_POSTAL_RULES = `POSTCODE RULES:
- UK postcodes follow the format: letters+numbers SPACE number+letters (e.g. "CB25 0BA", "CO10 7BQ", "PE28 2SB")
- Always extract the FULL postcode as one unit — if "CB25" is on one line and "0BA" on the next, postcode="CB25 0BA"
- A postcode fragment alone (like "0BA" or "OBA") is never a town — combine it with the preceding partial postcode
- If you see a full valid UK postcode anywhere in the text for that event, extract it
- Return postcodes in uppercase`
const GB_SCREENSHOT_LOCATION_LINES = `- Extract ONLY the pub/venue name into "Venue Name" — never include the village, town or postcode in it.
- Put the town or village in "Village", and the postcode, if one is shown, in "Postcode".
- UK postcodes look like "CB25 0BA", "CO10 7BQ", "PE28 2SB". If no postcode is shown, use "".`

// ── The templates the GB/US displays already wrote, as data (each one byte-identical to the code it replaced) ───────
const COMMA_VENUE_LOCALITY_POSTAL: AddressTemplate = { sep: ', ', parts: ['{venue}', '{locality}', '{postalCode}'] }
const DOT_LOCALITY_POSTAL: AddressTemplate = { sep: ' · ', parts: ['{locality}', '{postalCode}'] }

export const ADDRESS_FORMATS: Readonly<Record<AddressFormatKey, AddressFormat>> = {
  gb: {
    key: 'gb',
    adminLabel: 'United Kingdom — postcode',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'townOrArea' },
      { key: 'postalCode', required: false, label: 'postcode' },
    ],
    regions: null,
    postalCode: { pattern: '^([A-Z]{1,2}\\d[A-Z\\d]? \\d[A-Z]{2}|GIR 0AA)$', normaliser: 'gb', example: 'CB8 8PD', identifiesPremises: true },
    examples: { venue: 'The Red Lion', street: '123 High St', locality: 'Wickhambrook' },
    templates: {
      line: COMMA_VENUE_LOCALITY_POSTAL,
      area: [DOT_LOCALITY_POSTAL],
      calendar: COMMA_VENUE_LOCALITY_POSTAL,
      geocode: { sep: ', ', parts: ['{venue}', '{locality}', '{postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality', 'postal_town'], regionFrom: 'administrative_area_level_2', regionAs: 'long' },
    ai: { importerPostalRules: GB_IMPORTER_POSTAL_RULES, screenshotLocationLines: GB_SCREENSHOT_LOCATION_LINES },
    messagesStyle: 'postcode',
  },
  us: {
    key: 'us',
    adminLabel: 'United States — city, state, ZIP code',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'townOrArea' },
      { key: 'region', required: false, label: 'state' },
      { key: 'postalCode', required: false, label: 'zip' },
    ],
    regions: { list: US_STATES, shownAs: 'code' },
    postalCode: { pattern: '^\\d{5}(-\\d{4})?$', normaliser: 'zip', example: '78701', identifiesPremises: false },
    examples: { venue: 'Zilker Park', street: '123 Main St', locality: 'Austin', region: 'TX' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}'] },
      // With a state: "Hoboken, NJ 07030"; without one, the GB-style line every card had before.
      area: [{ sep: ', ', parts: ['{locality}', '{region} {postalCode}'], requires: ['region'] }, DOT_LOCALITY_POSTAL],
      // ⚠️ TODAY'S US CALENDAR LINE HAS NO STATE (lib/utils.ts getFullLocation never passed one). Kept exactly; add
      // '{region} {postalCode}' here to show it — a deliberate change, not a side effect.
      calendar: COMMA_VENUE_LOCALITY_POSTAL,
      geocode: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality', 'postal_town'], regionFrom: 'administrative_area_level_1', regionAs: 'short' },
    ai: {
      importerPostalRules: 'ZIP RULES:\n- "postcode" holds the five-digit ZIP code (e.g. "78701"); "state" holds the two-letter state (e.g. "TX")',
      screenshotLocationLines: '- Put the city or town in "Village", the two-letter state in "State" (e.g. "TX"), and the ZIP code, if one is shown, in "Postcode".',
    },
    messagesStyle: 'zip_state',
  },
  ie: {
    key: 'ie',
    adminLabel: 'Ireland — Eircode',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'townOrArea' },
      { key: 'region', required: false, label: 'county' },
      { key: 'postalCode', required: false, label: 'eircode' },
    ],
    regions: { list: IE_COUNTIES, shownAs: 'name' },
    postalCode: { pattern: '^([AC-FHKNPRTV-Y]\\d{2}|D6W) [0-9AC-FHKNPRTV-Y]{4}$', normaliser: 'eircode', example: 'D02 X963', identifiesPremises: true },
    examples: { venue: "People's Park", street: '12 Main Street', locality: 'Limerick', region: 'Co. Limerick' },
    templates: {
      // The county only when one was given: "People's Park, Limerick, V94 X2T6" / "…, Listowel, Co. Kerry, V31 …".
      line: { sep: ', ', parts: ['{venue}', '{locality}', '{region}', '{postalCode}'] },
      area: [DOT_LOCALITY_POSTAL],
      calendar: { sep: ', ', parts: ['{venue}', '{locality}', '{region}', '{postalCode}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{locality}', '{region}', '{postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality', 'postal_town'], regionFrom: 'administrative_area_level_1', regionAs: 'long' },
    ai: {
      importerPostalRules: 'EIRCODE RULES:\n- "postcode" holds the Eircode: 7 characters, a 3-character routing key, a space, then 4 characters (e.g. "D02 X963") — never a UK postcode\n- Return Eircodes in uppercase',
      screenshotLocationLines: '- Put the town in "Village", and the Eircode, if one is shown, in "Postcode" (e.g. "D02 X963"). If none is shown, use "".',
    },
    messagesStyle: 'postcode',
  },
  au: {
    key: 'au',
    adminLabel: 'Australia — suburb, state, postcode',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'suburb' },
      { key: 'region', required: true, label: 'stateTerritory' },
      { key: 'postalCode', required: true, label: 'postcode' },
    ],
    regions: { list: AU_STATES, shownAs: 'code' },
    postalCode: { pattern: '^\\d{4}$', normaliser: 'digits', example: '2026', identifiesPremises: false },
    examples: { venue: 'Bondi Pavilion', street: '1 Queen Elizabeth Dr', locality: 'Bondi Beach', region: 'NSW' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{locality} {region} {postalCode}'] },
      area: [{ sep: ' ', parts: ['{locality}', '{region}', '{postalCode}'] }],
      calendar: { sep: ', ', parts: ['{venue}', '{locality} {region} {postalCode}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{locality} {region} {postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality'], regionFrom: 'administrative_area_level_1', regionAs: 'short' },
    ai: {
      importerPostalRules: 'POSTCODE RULES:\n- "postcode" holds the 4-digit Australian postcode (e.g. "2026"); "state" holds the state or territory (NSW, VIC, QLD, SA, WA, TAS, NT, ACT)\n- The suburb goes in "town"',
      screenshotLocationLines: '- Put the suburb in "Village", the state or territory in "State" (e.g. "NSW"), and the 4-digit postcode, if one is shown, in "Postcode".',
    },
    messagesStyle: 'postcode',
  },
  nz: {
    key: 'nz',
    adminLabel: 'New Zealand — suburb, city, postcode',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'suburb', required: false, label: 'suburb' },
      { key: 'locality', required: true, label: 'townOrCity' },
      { key: 'postalCode', required: false, label: 'postcode' },
    ],
    regions: null,
    postalCode: { pattern: '^\\d{4}$', normaliser: 'digits', example: '1011', identifiesPremises: false },
    examples: { venue: 'Western Park', street: '1 Ponsonby Rd', locality: 'Auckland', suburb: 'Ponsonby' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{suburb}', '{locality} {postalCode}'] },
      area: [{ sep: ', ', parts: ['{suburb}', '{locality} {postalCode}'] }],
      calendar: { sep: ', ', parts: ['{venue}', '{suburb}', '{locality} {postalCode}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{suburb}', '{locality} {postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality', 'sublocality_level_1'], regionFrom: null, regionAs: 'long' },
    ai: {
      importerPostalRules: 'POSTCODE RULES:\n- "postcode" holds the 4-digit New Zealand postcode (e.g. "1011"); the suburb and the city both go in "town" ("Ponsonby, Auckland")',
      screenshotLocationLines: '- Put the suburb and city in "Village" (e.g. "Ponsonby, Auckland"), and the 4-digit postcode, if one is shown, in "Postcode".',
    },
    messagesStyle: 'postcode',
  },
  ca: {
    key: 'ca',
    adminLabel: 'Canada — city, province, postal code',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'city' },
      { key: 'region', required: true, label: 'province' },
      { key: 'postalCode', required: false, label: 'postalCode' },
    ],
    regions: { list: CA_PROVINCES, shownAs: 'code' },
    postalCode: { pattern: '^[ABCEGHJ-NPRSTVXY]\\d[ABCEGHJ-NPRSTV-Z] \\d[ABCEGHJ-NPRSTV-Z]\\d$', normaliser: 'ca', example: 'M5V 3L9', identifiesPremises: false },
    examples: { venue: 'Trinity Bellwoods Park', street: '790 Queen St W', locality: 'Toronto', region: 'ON' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}'] },
      area: [{ sep: ', ', parts: ['{locality}', '{region} {postalCode}'] }],
      calendar: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality'], regionFrom: 'administrative_area_level_1', regionAs: 'short' },
    ai: {
      importerPostalRules: 'POSTAL CODE RULES:\n- "postcode" holds the Canadian postal code, letter-digit-letter space digit-letter-digit (e.g. "M5V 3L9"); "state" holds the two-letter province (e.g. "ON")\n- Return postal codes in uppercase',
      screenshotLocationLines: '- Put the city in "Village", the two-letter province in "State" (e.g. "ON"), and the postal code, if one is shown, in "Postcode" (e.g. "M5V 3L9").',
    },
    // ⚠️ Until stage 2 moves the labels, Canada's forms take the city/state/ZIP words ("State", "ZIP code"): the closer
    // of the two shapes (it has a province field). Canada has no country row yet, so nothing shows this.
    messagesStyle: 'zip_state',
  },
}

export const ADDRESS_FORMAT_KEYS: readonly AddressFormatKey[] = Object.keys(ADDRESS_FORMATS) as AddressFormatKey[]

/** The legacy column values and the format each one behaves as, until the "run after deploy" SQL maps them. */
export const LEGACY_ADDRESS_FORMATS: Readonly<Record<LegacyAddressStyle, AddressFormatKey>> = { postcode: 'gb', zip_state: 'us' }

/** Every value `country_settings.address_format` may hold during the migration: the keys, then the two legacy values. */
export const ACCEPTED_ADDRESS_FORMAT_VALUES: readonly string[] = [...ADDRESS_FORMAT_KEYS, ...Object.keys(LEGACY_ADDRESS_FORMATS)]

export const isAddressFormatKey = (v: unknown): v is AddressFormatKey => typeof v === 'string' && (ADDRESS_FORMAT_KEYS as readonly string[]).includes(v)

/** A stored value → its format key: a key as it is, a legacy value mapped, anything else null. */
export function addressFormatKeyOf(v: unknown): AddressFormatKey | null {
  if (isAddressFormatKey(v)) return v
  return typeof v === 'string' && v in LEGACY_ADDRESS_FORMATS ? LEGACY_ADDRESS_FORMATS[v as LegacyAddressStyle] : null
}

/** The format for a key (or legacy value). Undefined for anything else — a caller with no format keeps its old line. */
export function addressFormatOf(v: unknown): AddressFormat | undefined {
  const k = addressFormatKeyOf(v)
  return k ? ADDRESS_FORMATS[k] : undefined
}

/** The `{style}` the existing messages select on, for a format (stage 1: labels unchanged). Unknown → 'postcode'. */
export function messagesStyleOf(v: unknown): LegacyAddressStyle {
  return addressFormatOf(v)?.messagesStyle ?? 'postcode'
}

// ── Regions ───────────────────────────────────────────────────────────────────────────────────────────────────────
const fold = (s: string) => s.trim().replace(/\.$/, '').replace(/\s+/g, ' ').toLowerCase()

/** A typed or stored region → the format's entry: its code, its name or an alias, any case. Null when the format has no
 *  region list or the value is not in it. */
export function regionOf(format: AddressFormat | undefined, raw: unknown): Region | null {
  if (!format?.regions || typeof raw !== 'string' || !raw.trim()) return null
  const f = fold(raw)
  return format.regions.list.find(r => fold(r.code) === f || fold(r.name) === f || (r.aliases ?? []).some(a => fold(a) === f)) ?? null
}

/** How a region is written on a line: its code ("NSW") or its name ("Co. Kerry"), per the format. */
export function regionDisplay(format: AddressFormat | undefined, raw: unknown): string | null {
  const r = regionOf(format, raw)
  if (!r) return null
  return format!.regions!.shownAs === 'name' ? r.name : r.code
}

// ── Postal codes ──────────────────────────────────────────────────────────────────────────────────────────────────
const NORMALISERS: Readonly<Record<PostalNormaliser, (s: string) => string>> = {
  /** "cb88pd" → "CB8 8PD": upper-case, one space before the last three. */
  gb: s => { const c = s.toUpperCase().replace(/\s+/g, ''); return c.length >= 5 && c.length <= 7 ? `${c.slice(0, -3)} ${c.slice(-3)}` : s.trim().toUpperCase() },
  /** "d02x963" → "D02 X963": upper-case, a space after the routing key. */
  eircode: s => { const c = s.toUpperCase().replace(/\s+/g, ''); return c.length === 7 ? `${c.slice(0, 3)} ${c.slice(3)}` : s.trim().toUpperCase() },
  /** " 2026 " → "2026". */
  digits: s => { const c = s.replace(/\s+/g, ''); return /^\d+$/.test(c) ? c : s.trim() },
  /** "78701 - 1234" → "78701-1234". */
  zip: s => s.trim().replace(/\s*-\s*/g, '-'),
  /** "m5v3l9" → "M5V 3L9". */
  ca: s => { const c = s.toUpperCase().replace(/\s+/g, ''); return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : s.trim().toUpperCase() },
  none: s => s.trim(),
}
export const POSTAL_NORMALISERS: readonly PostalNormaliser[] = Object.keys(NORMALISERS) as PostalNormaliser[]

/** A typed postal code tidied the format's way. (Stage 2's entry forms; displays print what was stored.) */
export function normalisePostalCode(format: AddressFormat, raw: string): string {
  return NORMALISERS[format.postalCode.normaliser](raw)
}

/** Whether a postal code (after normalising) has the format's shape. */
export function isValidPostalCode(format: AddressFormat, raw: string): boolean {
  return new RegExp(format.postalCode.pattern).test(normalisePostalCode(format, raw))
}

// ── Templates ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type TemplateValues = Partial<Record<TemplateToken, string | null | undefined>>

const TOKEN_RE = /\{([a-zA-Z]+)\}/g

/** One template → a line. Each part's tokens are filled; a part with nothing left is dropped; spaces collapse. */
export function renderTemplate(t: AddressTemplate, v: TemplateValues): string {
  const val = (k: string) => String(v[k as TemplateToken] ?? '').trim()
  return t.parts
    .map(p => p.replace(TOKEN_RE, (_, k: string) => val(k)).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(t.sep)
}

/** The first alternative whose `requires` tokens all have a value ('' when none qualifies). */
export function renderFirst(ts: readonly AddressTemplate[], v: TemplateValues): string {
  const t = ts.find(x => (x.requires ?? []).every(k => String(v[k] ?? '').trim()))
  return t ? renderTemplate(t, v) : ''
}

// ── The validator (the harness runs it; a bad entry is a build-time mistake, not a runtime surprise) ───────────────
export function validateAddressFormats(formats: Readonly<Record<string, AddressFormat>> = ADDRESS_FORMATS): string[] {
  const problems: string[] = []
  const templatesOf = (f: AddressFormat): AddressTemplate[] => [f.templates.line, ...f.templates.area, f.templates.calendar, f.templates.geocode]
  for (const [key, f] of Object.entries(formats)) {
    const at = (s: string) => problems.push(`${key}: ${s}`)
    if (f.key !== key) at(`key "${f.key}" does not match its entry`)
    if (!f.adminLabel?.trim()) at('no admin label')
    let compiles = true
    try { new RegExp(f.postalCode.pattern) } catch { compiles = false; at(`postal pattern does not compile: ${f.postalCode.pattern}`) }
    const knownNormaliser = f.postalCode.normaliser in NORMALISERS
    if (!knownNormaliser) at(`unknown normaliser ${f.postalCode.normaliser}`)
    if (compiles && knownNormaliser && !isValidPostalCode(f, f.postalCode.example)) at(`the example "${f.postalCode.example}" fails its own pattern`)
    const keys = f.fields.map(x => x.key)
    if (new Set(keys).size !== keys.length) at('a field appears twice')
    if (!keys.includes('locality')) at('no locality field')
    if (keys.includes('region') !== !!f.regions) at('a region field needs a region list, and a list needs the field')
    for (const t of templatesOf(f)) for (const p of t.parts) for (const m of p.matchAll(TOKEN_RE)) {
      if (!(TEMPLATE_TOKENS as readonly string[]).includes(m[1])) at(`unknown template token {${m[1]}}`)
      else if (!['venue', 'country'].includes(m[1]) && !keys.includes(m[1] as AddressFieldKey)) at(`template token {${m[1]}} has no field`)
    }
    if (!f.templates.area.length) at('no area template')
    if (f.regions) {
      const codes = f.regions.list.map(r => r.code)
      if (!codes.length) at('an empty region list')
      if (new Set(codes).size !== codes.length) at('a region code appears twice')
      for (const r of f.regions.list) if (!r.code.trim() || !r.name.trim() || r.code !== r.code.toUpperCase()) at(`malformed region ${JSON.stringify(r)}`)
    }
    if (!['postcode', 'zip_state'].includes(f.messagesStyle)) at(`unknown messages style ${f.messagesStyle}`)
  }
  return problems
}
