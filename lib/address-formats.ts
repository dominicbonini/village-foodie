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
// ── WHAT READS IT ──────────────────────────────────────────────────────────────────────────────────────────────────
// Stage 1: every DISPLAY (lib/event-address.ts — emails, event cards, the calendar line, WhatsApp prompts).
// Stage 2 (address-formats-2, 21 October 2026, docs/address-formats-2-report.md): the ENTRY FORMS (`fields`, `entry`,
// `examples`, the region list), GEOCODING (`templates.geocode`), GOOGLE PLACES (`places`), the AI PROMPTS (`ai`) and EVENT
// CONFLICTS (`postalCode.identifiesPremises`). GB and US read it too and come out byte-identical to the code it replaced
// (scripts/address-formats-2.cjs compares them against a capture of that code).
// Its follow-up (22 October 2026): the SCRAPER's Pass B prompt (`ai.scraper`, scripts/scraper-prompts.js), which imports
// this file directly — so keep it plain TypeScript Node can strip (no imports, no enums), as it is today.
//
// ── WORDS ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Field LABELS are not here: the words live in messages/ under `address.*`, keyed by field type and the variant named
// below (postcode / eircode / zip / postalCode; state / stateTerritory / province / county; area / townOrArea / city /
// suburb / townOrCity), so they translate. Examples, patterns, region names, templates and the AI rules ARE here: they
// are facts about a country's addresses ("CB8 8PD" is the same in every language), not words to translate.

export type AddressFormatKey = 'gb' | 'us' | 'ie' | 'au' | 'nz' | 'ca'
/** The two values `country_settings.address_format` held before this stage. Still accepted (see `addressFormatKeyOf`)
 *  so a deploy is safe before the "run after deploy" SQL maps them. */
export type LegacyAddressStyle = 'postcode' | 'zip_state'

export type AddressFieldKey = 'street' | 'suburb' | 'locality' | 'region' | 'postalCode'
export type PostalLabel = 'postcode' | 'eircode' | 'zip' | 'postalCode'
export type RegionLabel = 'state' | 'stateTerritory' | 'province' | 'county'
/** 'area' is GB/US's "Area (village, town or city)" (en-US "City or town"); 'townOrArea' is Ireland's "Town or area". */
export type LocalityLabel = 'area' | 'townOrArea' | 'city' | 'suburb' | 'townOrCity'
export type FieldLabel = PostalLabel | RegionLabel | LocalityLabel | 'street'
export type PostalNormaliser = 'gb' | 'eircode' | 'digits' | 'zip' | 'ca' | 'none'

export interface AddressField { key: AddressFieldKey; required: boolean; label: FieldLabel }
export interface Region {
  code: string; name: string; aliases?: readonly string[]
  /** canada-1 (22 October 2026): trucks BASED here cannot sign up yet (nor move their base here) — lib/trade-area.ts refuses
   *  with `tradeArea.region_closed`, naming the region and, when given, the language HatchGrab must be available in first.
   *  Quebec: the Charter of the French language (Bill 96) requires French, which HatchGrab does not have yet. */
  signupClosed?: { needsLanguage?: string }
  /** canada-1: the region's sales tax on prepared food, for a country whose menu prices exclude tax — the default a truck
   *  based here gets (its own rate in Manage › Payments › Tax still wins) and the line's name on the checkout and receipt.
   *  `milli` is thousandths of a percent (13 % = 13000), the unit of `trucks.tax_rate_milli`. */
  salesTax?: RegionSalesTax
}
/** One region's sales tax: its name on the bill ("HST", "GST") and its rate in thousandths of a percent. */
export interface RegionSalesTax { label: string; milli: number }
/** A line: the parts are joined by `sep`; a part whose tokens are all empty is dropped; spaces collapse.
 *  `requires`: an alternative used only when those tokens have a value (the first alternative that qualifies wins). */
export interface AddressTemplate { sep: string; parts: readonly string[]; requires?: readonly TemplateToken[] }
export type TemplateToken = 'venue' | 'street' | 'suburb' | 'locality' | 'region' | 'postalCode' | 'country'
export const TEMPLATE_TOKENS: readonly TemplateToken[] = ['venue', 'street', 'suburb', 'locality', 'region', 'postalCode', 'country']

/** How a form asks for an address beyond the fields themselves. GB and US have every flag off: their forms are exactly
 *  what they were (no asterisks, no live check, a free text State box for the US). */
export interface AddressEntry {
  /** A "Customers see:" line under the form: the `line` template filled with what has been typed (the examples until
   *  something is). */
  customersSee: boolean
  /** The postal code is checked against `postalCode.pattern` as it is typed (a warning, never a block) and tidied with
   *  the normaliser when the box is left and when the event is saved. */
  postalCheck: boolean
  /** Required fields carry the red asterisk. */
  requiredMarks: boolean
  /** The region box: a dropdown of the format's list, or a text box no longer than its longest code (the US box). */
  regionInput: 'select' | 'text'
  /** The line under a venue in the pickers and on a conflict: the format's `area` template ('area': "Bondi Beach NSW
   *  2026"), or the line those places always showed ('legacy': the area or else the postal code; town · postal code). */
  sublines: 'area' | 'legacy'
  /** The import review (as columns) and the Places editor show the format's region and suburb. Off for GB and the US,
   *  whose review and Places editor are what they were (the US state is saved from the importer and the event form). */
  reviewAndPlaces: boolean
}

/** The AI prompt rules (lib/schedule-extract.ts, lib/admin/screenshot-events.ts, scripts/scraper-prompts.js). `{country}`
 *  is the truck's or the chosen country's name and `{year}` the current year; nothing else is substituted (the scraper's
 *  rules use neither). GB's and US's are the prompts' own lines, verbatim (scripts/address-formats-2.cjs compares the
 *  importer and screenshot prompts, scripts/scraper-prompts-format.cjs the scraper's). */
export interface AddressAi {
  importer: {
    /** "2. ENRICH missing fields using your knowledge of …" */
    knowledge: string
    /** Under VENUE NAME RULES:, before the invalid-venue line. */
    venueRules: string
    /** The whole postal / region block, its heading included. */
    postalRules: string
    /** The whole ADDRESS RULES block. */
    addressRules: string
    /** The STEP 2 lines. */
    enrichRules: string
    examples: string
    /** The JSON keys between "venue_name" and "address" in the output line. */
    outputShape: string
  }
  screenshot: {
    /** Under TRUCK AND VENUE RULES:. */
    locationLines: string
    /** One event in the JSON the model returns. */
    eventShape: string
  }
  /** The scraper's Pass B prompt for HatchGrab-linked trucks (scripts/scraper-prompts.js buildHgPrompt). It asks only for
   *  the keys the scraper sends on to the bridge: "town", "state" (as the event's region) and "postcode". */
  scraper: {
    /** The VENUE RULES: line, its heading included. */
    venueRules: string
    /** The TOWN RULES (IMPORTANT): block, its heading included. */
    townRules: string
    /** The lines under "EXAMPLES (embedded-town split):". */
    examples: string
    /** The JSON keys after "venue_name":"Name", in the output line. */
    outputShape: string
  }
}

export type PlacesAdminLevel = 'administrative_area_level_1' | 'administrative_area_level_2'

export interface AddressFormat {
  key: AddressFormatKey
  /** Admin › Countries' dropdown. Admin-only English, like the registry's currency names. */
  adminLabel: string
  /** The ordered fields, as a form shows them. */
  fields: readonly AddressField[]
  regions: { list: readonly Region[]; shownAs: 'code' | 'name' } | null
  postalCode: {
    /** Checked after normalising. Warn-only on entry. */
    pattern: string
    normaliser: PostalNormaliser
    example: string
    /** True when one postal code is one address (GB, Eircode). False when it covers a whole area — a ZIP, an AU/NZ
     *  4-digit code — so "same postcode" must never mean "same venue" (lib/event-conflicts.ts). */
    identifiesPremises: boolean
  }
  entry: AddressEntry
  /** Placeholders for the entry forms ("e.g. …" around them is a message). `addressLine` is the Address box's example
   *  (GB's includes the town, as it always has); `importPostalCode` is the import review's postal column;
   *  `paste` is the venue-and-town part of the paste box's example. */
  examples: { venue: string; addressLine: string; locality: string; suburb?: string; region?: string; importPostalCode: string; paste: string }
  templates: {
    /** One line: emails, WhatsApp prompts, the "Customers see:" line. Callers leave out the postal code where a line
     *  never had one. */
    line: AddressTemplate
    /** Under the venue on an event card. Alternatives, first that qualifies. */
    area: readonly AddressTemplate[]
    /** The calendar invite's location. */
    calendar: AddressTemplate
    /** What the geocoder is asked. */
    geocode: AddressTemplate
  }
  /** Google Places: which result types a town search asks for, where the region comes from (the first level present),
   *  and whether a region CODE is kept for the truck (`trucks.base_region_code`): 'exact' keeps Places' short text only
   *  when it is, exactly, a code in the list ("NJ", "NSW"); 'match' looks the long or short text up in the list ("County
   *  Kerry" → "KY"); null keeps none, and the key is absent from the answer (GB's answer is what it was). */
  places: { localityTypes: readonly string[]; regionFrom: readonly PlacesAdminLevel[]; regionCode: 'exact' | 'match' | null }
  ai: AddressAi
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

// canada-1 (22 October 2026, docs/canada-1-report.md §2): each province's SALES TAX ON PREPARED FOOD (a food truck's meals) —
// the default a truck based there gets and the name on its bill — and Quebec CLOSED to signups (French first, Bill 96).
// Rates: CRA, "GST/HST rates" (https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/
// charge-collect-which-rate.html — Nova Scotia's HST is 14% since 1 April 2025); prepared food is taxable for GST/HST (CRA
// Memorandum 4.3). Provincial sales tax on meals: BRITISH COLUMBIA does not (PST 7 % exempts "Meals" — gov.bc.ca, food and beverage
// service providers, 22 Apr 2026), so a BC truck's default is GST 5 %; SASKATCHEWAN taxes them (PST 6%, Information Bulletin PST-33: "meals and other
// prepared food … are subject to PST"); MANITOBA taxes them (RST 7%; its 1 July 2026 grocery exemption excludes restaurants,
// "concession stands, food carts and food trucks" — Information Notice RST 26-01). ⚠️ A province with TWO taxes is one line
// today ("GST + PST", the combined rate): an order holds one tax line (lib/order-charges.ts), and Saskatchewan asks for PST
// as a separate amount on the invoice — the two-line proposal is docs/canada-1-report.md §2.4, not built.
const CA_TAX = {
  gst: { label: 'GST', milli: 5000 },
  hst13: { label: 'HST', milli: 13000 }, hst14: { label: 'HST', milli: 14000 }, hst15: { label: 'HST', milli: 15000 },
  gstPstSk: { label: 'GST + PST', milli: 11000 }, gstRstMb: { label: 'GST + RST', milli: 12000 },
} as const
const CA_PROVINCES: readonly Region[] = [
  { code: 'AB', name: 'Alberta', salesTax: CA_TAX.gst },
  // BC: PST does not apply to meals ("Sales of food for human consumption are exempt from PST, including: … Meals") — it does to
  // soda beverages (7 %, since 1 April 2021) and liquor (10 %), which a truck selling them covers with its own rate (Dominic, 22 Oct).
  { code: 'BC', name: 'British Columbia', salesTax: CA_TAX.gst },
  { code: 'MB', name: 'Manitoba', salesTax: CA_TAX.gstRstMb },
  { code: 'NB', name: 'New Brunswick', salesTax: CA_TAX.hst15 },
  { code: 'NL', name: 'Newfoundland and Labrador', salesTax: CA_TAX.hst15 },
  { code: 'NS', name: 'Nova Scotia', salesTax: CA_TAX.hst14 },
  { code: 'NT', name: 'Northwest Territories', salesTax: CA_TAX.gst },
  { code: 'NU', name: 'Nunavut', salesTax: CA_TAX.gst },
  { code: 'ON', name: 'Ontario', salesTax: CA_TAX.hst13 },
  { code: 'PE', name: 'Prince Edward Island', salesTax: CA_TAX.hst15 },
  { code: 'QC', name: 'Quebec', signupClosed: { needsLanguage: 'French' } },
  { code: 'SK', name: 'Saskatchewan', salesTax: CA_TAX.gstPstSk },
  { code: 'YT', name: 'Yukon', salesTax: CA_TAX.gst },
]

// ── GB's and US's AI rules — THE PROMPTS' OWN LINES, VERBATIM (lib/schedule-extract.ts, lib/admin/screenshot-events.ts;
// the scraper's from scripts/scraper-prompts.js, its UK and zip_state branches — address-formats-2 follow-up, 22 Oct 2026) ──
const GB_AI: AddressAi = {
  importer: {
    knowledge: `UK venues and locations`,
    venueRules: `- Extract ONLY the pub/venue name — never include village, town, or postcode in venue_name
- "The Fox Burwell" → venue_name="The Fox", town="Burwell"
- "The Red Lion Belchamp Otten CO10 7BQ" → venue_name="The Red Lion", town="Belchamp Otten", postcode="CO10 7BQ"
- "Five Bells, Burwell, CB25 0EJ, 5pm-9pm" → venue_name="The Five Bells", town="Burwell", postcode="CB25 0EJ"`,
    postalRules: `POSTCODE RULES:
- UK postcodes follow the format: letters+numbers SPACE number+letters (e.g. "CB25 0BA", "CO10 7BQ", "PE28 2SB")
- Always extract the FULL postcode as one unit — if "CB25" is on one line and "0BA" on the next, postcode="CB25 0BA"
- A postcode fragment alone (like "0BA" or "OBA") is never a town — combine it with the preceding partial postcode
- If you see a full valid UK postcode anywhere in the text for that event, extract it
- Return postcodes in uppercase`,
    addressRules: `ADDRESS RULES:
- address is for street-level detail only — house number + street name (e.g. "12 High Street")
- NEVER populate address with the town name, village name, or postcode — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases`,
    enrichRules: `- If you have a venue name and town but no postcode → look up the UK postcode for that venue and provide it
- If you have a venue name but no town → determine the town/village from your knowledge of that UK venue
- If the venue name is ambiguous (e.g. "The Fox") and you have a postcode or town → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""`,
    examples: `Input: "Wednesday 3/6 The Red Lion Belchamp Otten CO10 7BQ"
Output: {"event_date":"03/06/{year}","start_time":"","end_time":"","venue_name":"The Red Lion","town":"Belchamp Otten","postcode":"CO10 7BQ"}

Input: "Friday 5/6 The Fox Burwell CB25 0BA"
Output: {"event_date":"05/06/{year}","start_time":"","end_time":"","venue_name":"The Fox","town":"Burwell","postcode":"CB25 0BA"}

Input: "Sunday 7/6 The Five Bells Burwell Birthday Party from 5pm"
Output: {"event_date":"07/06/{year}","start_time":"17:00","end_time":"","venue_name":"The Five Bells","town":"Burwell","postcode":"CB25 0EJ"}

Input: "Sat 14th June The Crown Wickhambrook 5pm-9pm"
Output: {"event_date":"14/06/{year}","start_time":"17:00","end_time":"21:00","venue_name":"The Crown","town":"Wickhambrook","postcode":"CB8 8PD"}`,
    outputShape: `"town":"Town","postcode":"POSTCODE"`,
  },
  screenshot: {
    locationLines: `- Extract ONLY the pub/venue name into "Venue Name" — never include the village, town or postcode in it.
- Put the town or village in "Village", and the postcode, if one is shown, in "Postcode".
- UK postcodes look like "CB25 0BA", "CO10 7BQ", "PE28 2SB". If no postcode is shown, use "".`,
    eventShape: `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town", "Postcode": "CB25 0BA" }`,
  },
  scraper: {
    venueRules: `VENUE RULES: "venue_name" = ONLY the pub/venue name. "town" = the village/town/city it is in.`,
    townRules: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the town/village is EMBEDDED inside the venue name,
SPLIT it out — put the place-name in "town" and keep "venue_name" as just the pub/venue name. A UK
place-name sitting next to a generic pub name (Bells/Star/Bell/Lion/Swan/Arms/Crown/Anchor, etc.) is the
town, not part of the venue name. Never leave a town buried in venue_name. If the town truly cannot be
determined, use "".`,
    examples: `  "The Cavendish Five Bells"      -> {"venue_name":"Five Bells","town":"Cavendish"}
  "The Star Pub, Lidgate"         -> {"venue_name":"The Star","town":"Lidgate"}
  "Nethergate Brewery, Long Melford" -> {"venue_name":"Nethergate Brewery","town":"Long Melford"}`,
    outputShape: `"town":"Town","postcode":"Postcode or empty"`,
  },
}
const US_AI: AddressAi = {
  importer: {
    knowledge: `venues and locations in {country}`,
    venueRules: `- Extract ONLY the venue name — never include the city, state or ZIP code in venue_name
- "Joe's Tavern Austin TX 78701" → venue_name="Joe's Tavern", town="Austin", state="TX", postcode="78701"
- "Sunset Brewery, Boulder, CO" → venue_name="Sunset Brewery", town="Boulder", state="CO"`,
    postalRules: `ZIP CODE AND STATE RULES:
- "town" is the city or town; "state" is the two-letter state code (e.g. "TX", "CA")
- ZIP codes are five digits (e.g. "78701"); put the ZIP code in "postcode"
- If you see a ZIP code anywhere in the text for that event, extract it`,
    addressRules: `ADDRESS RULES:
- address is for street-level detail only — house number + street name (e.g. "1200 Main Street")
- NEVER populate address with the city, state or ZIP code — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases`,
    enrichRules: `- If you have a venue name and town but no state → determine the state from your knowledge of that venue
- If you have a venue name but no town → determine the city or town from your knowledge of that venue in {country}
- If the venue name is ambiguous and you have a town or ZIP code → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""`,
    examples: `Input: "Sat June 14 Joe's Tavern Austin TX 5pm-9pm"
Output: {"event_date":"14/06/{year}","start_time":"17:00","end_time":"21:00","venue_name":"Joe's Tavern","town":"Austin","state":"TX","postcode":""}

Input: "6/7 Sunset Brewery, Boulder CO 80302 from 4pm"
Output: {"event_date":"07/06/{year}","start_time":"16:00","end_time":"","venue_name":"Sunset Brewery","town":"Boulder","state":"CO","postcode":"80302"}`,
    outputShape: `"town":"City","state":"ST","postcode":"ZIP"`,
  },
  screenshot: {
    locationLines: `- Extract ONLY the venue name into "Venue Name" — never include the city, state or ZIP code in it.
- Put the city or town in "Village", the two-letter state in "State" (e.g. "TX"), and the ZIP code, if one is shown, in "Postcode".
- ZIP codes look like "78701". If no ZIP code is shown, use "".`,
    eventShape: `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "City", "State": "TX", "Postcode": "78701" }`,
  },
  scraper: {
    venueRules: `VENUE RULES: "venue_name" = ONLY the venue name. "town" = the city or town it is in. "state" = its two-letter state (e.g. "TX").`,
    townRules: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the city or town is EMBEDDED inside the venue name, SPLIT it out —
put the place-name in "town", the state in "state", and keep "venue_name" as just the venue name. If the town truly
cannot be determined, use "".`,
    examples: `  "Joe's Tavern Austin TX"        -> {"venue_name":"Joe's Tavern","town":"Austin","state":"TX"}
  "Sunset Brewery, Boulder, CO"    -> {"venue_name":"Sunset Brewery","town":"Boulder","state":"CO"}`,
    outputShape: `"town":"City","state":"ST","postcode":"ZIP code or empty"`,
  },
}

// ── The other formats' AI rules (address-formats-2). Written for this stage: each names its own postal code and region,
// never a UK postcode, and asks for the region / suburb only where the format has that field.
const IE_AI: AddressAi = {
  importer: {
    knowledge: `venues and locations in {country}`,
    venueRules: `- Extract ONLY the pub/venue name — never include the town, county or Eircode in venue_name
- "People's Park Limerick V94 X2T6" → venue_name="People's Park", town="Limerick", postcode="V94 X2T6"
- "Market Square, Listowel, Co. Kerry, 5pm-9pm" → venue_name="Market Square", town="Listowel", state="Co. Kerry"`,
    postalRules: `EIRCODE AND COUNTY RULES:
- "postcode" holds the Eircode: 7 characters, a 3-character routing key, a space, then 4 characters (e.g. "D02 X963", "V94 X2T6") — never a UK postcode
- Always extract the FULL Eircode as one unit, even when it is split across two lines
- An Eircode fragment alone is never a town
- "state" holds the county when one is written (e.g. "Co. Kerry"); otherwise leave it ""
- Return Eircodes in uppercase`,
    addressRules: `ADDRESS RULES:
- address is for street-level detail only — house number + street name (e.g. "12 Main Street")
- NEVER populate address with the town, county or Eircode — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases`,
    enrichRules: `- If you have a venue name and town but no Eircode → give the venue's Eircode only if you are certain of it
- If you have a venue name but no town → determine the town from your knowledge of that venue in {country}
- If the venue name is ambiguous and you have an Eircode or town → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""`,
    examples: `Input: "Wednesday 3/6 People's Park Limerick V94 X2T6"
Output: {"event_date":"03/06/{year}","start_time":"","end_time":"","venue_name":"People's Park","town":"Limerick","state":"","postcode":"V94 X2T6"}

Input: "Sat 14th June Market Square Listowel Co. Kerry 5pm-9pm"
Output: {"event_date":"14/06/{year}","start_time":"17:00","end_time":"21:00","venue_name":"Market Square","town":"Listowel","state":"Co. Kerry","postcode":""}`,
    outputShape: `"town":"Town","state":"Co. County","postcode":"EIRCODE"`,
  },
  screenshot: {
    locationLines: `- Extract ONLY the venue name into "Venue Name" — never include the town, county or Eircode in it.
- Put the town in "Village", the county, if one is shown, in "State" (e.g. "Co. Kerry"), and the Eircode, if one is shown, in "Postcode".
- Eircodes look like "D02 X963", "V94 X2T6" — never a UK postcode. If no Eircode is shown, use "".`,
    eventShape: `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town", "State": "Co. Kerry", "Postcode": "D02 X963" }`,
  },
  scraper: {
    venueRules: `VENUE RULES: "venue_name" = ONLY the pub/venue name. "town" = the town or village it is in. "state" = its county when one is written (e.g. "Co. Kerry"), otherwise "". "postcode" = the Eircode (e.g. "D02 X963") — never a UK postcode.`,
    townRules: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the town or village is EMBEDDED inside the venue name, SPLIT it out —
put the place-name in "town", the county in "state", and keep "venue_name" as just the venue name. Never leave a town
buried in venue_name. If the town truly cannot be determined, use "".`,
    examples: `  "Market Square Listowel Co. Kerry" -> {"venue_name":"Market Square","town":"Listowel","state":"Co. Kerry"}
  "People's Park, Limerick"          -> {"venue_name":"People's Park","town":"Limerick"}`,
    outputShape: `"town":"Town","state":"Co. County or empty","postcode":"Eircode or empty"`,
  },
}
const AU_AI: AddressAi = {
  importer: {
    knowledge: `venues and locations in {country}`,
    venueRules: `- Extract ONLY the venue name — never include the suburb, state or postcode in venue_name
- "Bondi Pavilion Bondi Beach NSW 2026" → venue_name="Bondi Pavilion", town="Bondi Beach", state="NSW", postcode="2026"
- "Fed Square, Melbourne, 5pm-9pm" → venue_name="Fed Square", town="Melbourne"`,
    postalRules: `SUBURB, STATE AND POSTCODE RULES:
- "town" is the suburb (e.g. "Bondi Beach") — not the council
- "state" is the state or territory as its abbreviation: NSW, VIC, QLD, SA, WA, TAS, NT or ACT
- "postcode" holds the 4-digit Australian postcode (e.g. "2026")
- If you see a postcode anywhere in the text for that event, extract it`,
    addressRules: `ADDRESS RULES:
- address is for street-level detail only — house number + street name (e.g. "1 Queen Elizabeth Drive")
- NEVER populate address with the suburb, state or postcode — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases`,
    enrichRules: `- If you have a venue name and suburb but no state → determine the state from your knowledge of that venue
- If you have a venue name and suburb but no postcode → give the suburb's postcode only if you are certain of it
- If you have a venue name but no suburb → determine the suburb from your knowledge of that venue in {country}
- If the venue name is ambiguous and you have a suburb or postcode → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""`,
    examples: `Input: "Sat 14th June Bondi Pavilion Bondi Beach NSW 5pm-9pm"
Output: {"event_date":"14/06/{year}","start_time":"17:00","end_time":"21:00","venue_name":"Bondi Pavilion","town":"Bondi Beach","state":"NSW","postcode":"2026"}

Input: "Friday 6/6 Fed Square Melbourne VIC 3000 from 4pm"
Output: {"event_date":"06/06/{year}","start_time":"16:00","end_time":"","venue_name":"Fed Square","town":"Melbourne","state":"VIC","postcode":"3000"}`,
    outputShape: `"town":"Suburb","state":"NSW","postcode":"POSTCODE"`,
  },
  screenshot: {
    locationLines: `- Extract ONLY the venue name into "Venue Name" — never include the suburb, state or postcode in it.
- Put the suburb in "Village", the state or territory in "State" (NSW, VIC, QLD, SA, WA, TAS, NT or ACT), and the postcode, if one is shown, in "Postcode".
- Australian postcodes are 4 digits, like "2026". If no postcode is shown, use "".`,
    eventShape: `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Suburb", "State": "NSW", "Postcode": "2026" }`,
  },
  scraper: {
    venueRules: `VENUE RULES: "venue_name" = ONLY the venue name. "town" = the suburb it is in (not the council). "state" = its state or territory as NSW, VIC, QLD, SA, WA, TAS, NT or ACT. "postcode" = the 4-digit postcode.`,
    townRules: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the suburb is EMBEDDED inside the venue name, SPLIT it out —
put the suburb in "town", the state in "state", and keep "venue_name" as just the venue name. If the suburb truly
cannot be determined, use "".`,
    examples: `  "Bondi Pavilion Bondi Beach NSW" -> {"venue_name":"Bondi Pavilion","town":"Bondi Beach","state":"NSW"}
  "Fed Square, Melbourne, VIC"     -> {"venue_name":"Fed Square","town":"Melbourne","state":"VIC"}`,
    outputShape: `"town":"Suburb","state":"NSW","postcode":"Postcode or empty"`,
  },
}
const NZ_AI: AddressAi = {
  importer: {
    knowledge: `venues and locations in {country}`,
    venueRules: `- Extract ONLY the venue name — never include the suburb, town or city, or postcode in venue_name
- "Western Park Ponsonby Auckland 1011" → venue_name="Western Park", suburb="Ponsonby", town="Auckland", postcode="1011"
- "Cuba Street Market, Wellington, 5pm-9pm" → venue_name="Cuba Street Market", town="Wellington"`,
    postalRules: `SUBURB, TOWN AND POSTCODE RULES:
- "town" is the town or city (e.g. "Auckland"); "suburb" is the suburb within it when one is written (e.g. "Ponsonby"), otherwise ""
- "postcode" holds the 4-digit New Zealand postcode (e.g. "1011")
- If you see a postcode anywhere in the text for that event, extract it`,
    addressRules: `ADDRESS RULES:
- address is for street-level detail only — house number + street name (e.g. "1 Ponsonby Road")
- NEVER populate address with the suburb, town or city, or postcode — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases`,
    enrichRules: `- If you have a venue name and town but no postcode → give the venue's postcode only if you are certain of it
- If you have a venue name but no town → determine the town or city from your knowledge of that venue in {country}
- If the venue name is ambiguous and you have a suburb, town or postcode → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""`,
    examples: `Input: "Sat 14th June Western Park Ponsonby Auckland 5pm-9pm"
Output: {"event_date":"14/06/{year}","start_time":"17:00","end_time":"21:00","venue_name":"Western Park","suburb":"Ponsonby","town":"Auckland","postcode":"1011"}

Input: "Friday 6/6 Cuba Street Market Wellington from 4pm"
Output: {"event_date":"06/06/{year}","start_time":"16:00","end_time":"","venue_name":"Cuba Street Market","suburb":"","town":"Wellington","postcode":""}`,
    outputShape: `"suburb":"Suburb","town":"Town or city","postcode":"POSTCODE"`,
  },
  screenshot: {
    locationLines: `- Extract ONLY the venue name into "Venue Name" — never include the suburb, town or city, or postcode in it.
- Put the town or city in "Village" (e.g. "Auckland" — not the suburb), and the postcode, if one is shown, in "Postcode".
- New Zealand postcodes are 4 digits, like "1011". If no postcode is shown, use "".`,
    eventShape: `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town or city", "Postcode": "1011" }`,
  },
  scraper: {
    venueRules: `VENUE RULES: "venue_name" = ONLY the venue name. "town" = the town or city it is in (not the suburb). "postcode" = the 4-digit postcode.`,
    townRules: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the town or city is EMBEDDED inside the venue name, SPLIT it out —
put the place-name in "town" and keep "venue_name" as just the venue name. If the town truly cannot be determined,
use "".`,
    examples: `  "Western Park Ponsonby Auckland" -> {"venue_name":"Western Park","town":"Auckland"}
  "Cuba Street Market, Wellington"  -> {"venue_name":"Cuba Street Market","town":"Wellington"}`,
    outputShape: `"town":"Town or city","postcode":"Postcode or empty"`,
  },
}
const CA_AI: AddressAi = {
  importer: {
    knowledge: `venues and locations in {country}`,
    venueRules: `- Extract ONLY the venue name — never include the city, province or postal code in venue_name
- "Market Square Toronto ON M5V 3L9" → venue_name="Market Square", town="Toronto", state="ON", postcode="M5V 3L9"
- "Granville Island, Vancouver, BC" → venue_name="Granville Island", town="Vancouver", state="BC"`,
    postalRules: `POSTAL CODE AND PROVINCE RULES:
- "town" is the city or town; "state" is the two-letter province or territory code (e.g. "ON", "BC")
- Postal codes are letter-digit-letter, a space, then digit-letter-digit (e.g. "M5V 3L9"); put the postal code in "postcode"
- Always extract the FULL postal code as one unit, even when it is split across two lines
- Return postal codes in uppercase`,
    addressRules: `ADDRESS RULES:
- address is for street-level detail only — house number + street name (e.g. "790 Queen Street West")
- NEVER populate address with the city, province or postal code — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases`,
    enrichRules: `- If you have a venue name and town but no province → determine the province from your knowledge of that venue
- If you have a venue name but no town → determine the city or town from your knowledge of that venue in {country}
- If the venue name is ambiguous and you have a town or postal code → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""`,
    examples: `Input: "Sat 14th June Market Square Toronto ON M5V 3L9 5pm-9pm"
Output: {"event_date":"14/06/{year}","start_time":"17:00","end_time":"21:00","venue_name":"Market Square","town":"Toronto","state":"ON","postcode":"M5V 3L9"}

Input: "Friday 6/6 Granville Island Vancouver BC from 4pm"
Output: {"event_date":"06/06/{year}","start_time":"16:00","end_time":"","venue_name":"Granville Island","town":"Vancouver","state":"BC","postcode":""}`,
    outputShape: `"town":"City","state":"ON","postcode":"POSTAL CODE"`,
  },
  screenshot: {
    locationLines: `- Extract ONLY the venue name into "Venue Name" — never include the city, province or postal code in it.
- Put the city or town in "Village", the two-letter province in "State" (e.g. "ON"), and the postal code, if one is shown, in "Postcode".
- Postal codes look like "M5V 3L9". If no postal code is shown, use "".`,
    eventShape: `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "City", "State": "ON", "Postcode": "M5V 3L9" }`,
  },
  scraper: {
    venueRules: `VENUE RULES: "venue_name" = ONLY the venue name. "town" = the city or town it is in. "state" = its two-letter province or territory (e.g. "ON"). "postcode" = the postal code (e.g. "M5V 3L9").`,
    townRules: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the city or town is EMBEDDED inside the venue name, SPLIT it out —
put the place-name in "town", the province in "state", and keep "venue_name" as just the venue name. If the town truly
cannot be determined, use "".`,
    examples: `  "Market Square Toronto ON"        -> {"venue_name":"Market Square","town":"Toronto","state":"ON"}
  "Granville Island, Vancouver, BC" -> {"venue_name":"Granville Island","town":"Vancouver","state":"BC"}`,
    outputShape: `"town":"City","state":"ON","postcode":"Postal code or empty"`,
  },
}

// ── The templates the GB/US displays already wrote, as data (each one byte-identical to the code it replaced) ───────
const COMMA_VENUE_LOCALITY_POSTAL: AddressTemplate = { sep: ', ', parts: ['{venue}', '{locality}', '{postalCode}'] }
const DOT_LOCALITY_POSTAL: AddressTemplate = { sep: ' · ', parts: ['{locality}', '{postalCode}'] }

export const ADDRESS_FORMATS: Readonly<Record<AddressFormatKey, AddressFormat>> = {
  gb: {
    key: 'gb',
    adminLabel: 'United Kingdom — postcode',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'area' },
      { key: 'postalCode', required: false, label: 'postcode' },
    ],
    regions: null,
    postalCode: { pattern: '^([A-Z]{1,2}\\d[A-Z\\d]? \\d[A-Z]{2}|GIR 0AA)$', normaliser: 'gb', example: 'CB8 8PD', identifiesPremises: true },
    entry: { customersSee: false, postalCheck: false, requiredMarks: false, regionInput: 'text', sublines: 'legacy', reviewAndPlaces: false },
    examples: { venue: 'The Crown', addressLine: '123 High St, Wickhambrook', locality: 'Wickhambrook', importPostalCode: 'CB22 5EJ', paste: 'The Crown, Wickhambrook' },
    templates: {
      line: COMMA_VENUE_LOCALITY_POSTAL,
      area: [DOT_LOCALITY_POSTAL],
      calendar: COMMA_VENUE_LOCALITY_POSTAL,
      geocode: { sep: ', ', parts: ['{venue}', '{locality}', '{postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality', 'postal_town'], regionFrom: ['administrative_area_level_2', 'administrative_area_level_1'], regionCode: null },
    ai: GB_AI,
  },
  us: {
    key: 'us',
    adminLabel: 'United States — city, state, ZIP code',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'area' },
      { key: 'region', required: false, label: 'state' },
      { key: 'postalCode', required: false, label: 'zip' },
    ],
    regions: { list: US_STATES, shownAs: 'code' },
    postalCode: { pattern: '^\\d{5}(-\\d{4})?$', normaliser: 'zip', example: '78701', identifiesPremises: false },
    entry: { customersSee: false, postalCheck: false, requiredMarks: false, regionInput: 'text', sublines: 'legacy', reviewAndPlaces: false },
    examples: { venue: 'Main Street Brewery', addressLine: '123 Main St, Austin, TX 78701', locality: 'Austin', region: 'NJ', importPostalCode: '78701', paste: 'Zilker Park, Austin' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}'] },
      // With a state: "Hoboken, NJ 07030"; without one, the GB-style line every card had before.
      area: [{ sep: ', ', parts: ['{locality}', '{region} {postalCode}'], requires: ['region'] }, DOT_LOCALITY_POSTAL],
      // ⚠️ TODAY'S US CALENDAR LINE HAS NO STATE (lib/utils.ts getFullLocation never passed one). Kept exactly; add
      // '{region} {postalCode}' here to show it — a deliberate change, not a side effect.
      calendar: COMMA_VENUE_LOCALITY_POSTAL,
      // ⚠️ TODAY'S US GEOCODE QUERY HAS NO STATE (app/api/manage/geocode/route.ts never sent one). Kept exactly, like the
      // calendar line; add '{region} {postalCode}' to send it — a deliberate change, not a side effect.
      geocode: { sep: ', ', parts: ['{venue}', '{locality}', '{postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality', 'postal_town'], regionFrom: ['administrative_area_level_1'], regionCode: 'exact' },
    ai: US_AI,
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
    entry: { customersSee: true, postalCheck: true, requiredMarks: true, regionInput: 'select', sublines: 'area', reviewAndPlaces: true },
    examples: { venue: "People's Park", addressLine: '12 Main Street, Limerick', locality: 'Limerick', region: 'Co. Limerick', importPostalCode: 'V94 X2T6', paste: "People's Park, Limerick" },
    templates: {
      // The county only when one was given: "People's Park, Limerick, V94 X2T6" / "…, Listowel, Co. Kerry, V31 …".
      line: { sep: ', ', parts: ['{venue}', '{locality}', '{region}', '{postalCode}'] },
      area: [DOT_LOCALITY_POSTAL],
      calendar: { sep: ', ', parts: ['{venue}', '{locality}', '{region}', '{postalCode}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{locality}', '{region}', '{postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality', 'postal_town'], regionFrom: ['administrative_area_level_1'], regionCode: 'match' },
    ai: IE_AI,
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
    entry: { customersSee: true, postalCheck: true, requiredMarks: true, regionInput: 'select', sublines: 'area', reviewAndPlaces: true },
    examples: { venue: 'Bondi Pavilion', addressLine: '1 Queen Elizabeth Dr, Bondi Beach', locality: 'Bondi Beach', region: 'NSW', importPostalCode: '2026', paste: 'Bondi Pavilion, Bondi Beach' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{locality} {region} {postalCode}'] },
      area: [{ sep: ' ', parts: ['{locality}', '{region}', '{postalCode}'] }],
      calendar: { sep: ', ', parts: ['{venue}', '{locality} {region} {postalCode}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{locality} {region} {postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality'], regionFrom: ['administrative_area_level_1'], regionCode: 'exact' },
    ai: AU_AI,
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
    entry: { customersSee: true, postalCheck: true, requiredMarks: true, regionInput: 'select', sublines: 'area', reviewAndPlaces: true },
    examples: { venue: 'Western Park', addressLine: '1 Ponsonby Rd, Ponsonby', locality: 'Auckland', suburb: 'Ponsonby', importPostalCode: '1011', paste: 'Western Park, Auckland' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{suburb}', '{locality} {postalCode}'] },
      area: [{ sep: ', ', parts: ['{suburb}', '{locality} {postalCode}'] }],
      calendar: { sep: ', ', parts: ['{venue}', '{suburb}', '{locality} {postalCode}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{suburb}', '{locality} {postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality', 'sublocality_level_1'], regionFrom: [], regionCode: null },
    ai: NZ_AI,
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
    entry: { customersSee: true, postalCheck: true, requiredMarks: true, regionInput: 'select', sublines: 'area', reviewAndPlaces: true },
    examples: { venue: 'Trinity Bellwoods Park', addressLine: '790 Queen St W, Toronto', locality: 'Toronto', region: 'ON', importPostalCode: 'M5V 3L9', paste: 'Trinity Bellwoods Park, Toronto' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}'] },
      area: [{ sep: ', ', parts: ['{locality}', '{region} {postalCode}'] }],
      calendar: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{locality}', '{region} {postalCode}', '{country}'] },
    },
    places: { localityTypes: ['locality'], regionFrom: ['administrative_area_level_1'], regionCode: 'exact' },
    ai: CA_AI,
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

/** The format a caller with no (or an unreadable) value falls back to: GB, as every such caller did before. */
export const DEFAULT_ADDRESS_FORMAT: AddressFormatKey = 'gb'

/** The format for a stored value, or the default (GB). For callers that must always have one: forms, prompts, Places. */
export function addressFormatOrDefault(v: unknown): AddressFormat {
  return addressFormatOf(v) ?? ADDRESS_FORMATS[DEFAULT_ADDRESS_FORMAT]
}

/** The field a format has for a key, or undefined (GB has no region, NZ has a suburb). */
export function fieldOf(format: AddressFormat, key: AddressFieldKey): AddressField | undefined {
  return format.fields.find(f => f.key === key)
}

/** The postal field's label variant — the key the `address.*` messages are written under. */
export function postalLabelOf(format: AddressFormat): PostalLabel {
  return (fieldOf(format, 'postalCode')?.label ?? 'postcode') as PostalLabel
}

/** An AI rule with its `{country}` and `{year}` filled in. */
export function fillAiText(text: string, v: { country: string; year: number }): string {
  return text.replace(/\{country\}/g, v.country).replace(/\{year\}/g, String(v.year))
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

/** canada-1: the sales tax of the region a truck is BASED in (`trucks.base_region_code`, stored exactly as the format's code),
 *  or null — no format, no region list, a code not in it, or a region with no tax data (every US state: a US truck sets its
 *  own rate, as before). */
export function regionSalesTax(formatValue: unknown, code: unknown): RegionSalesTax | null {
  const f = addressFormatOf(formatValue)
  if (!f?.regions || typeof code !== 'string') return null
  return f.regions.list.find(r => r.code === code)?.salesTax ?? null
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
      // canada-1: a region's sales tax is a named rate between 0 and 100 %, in whole thousandths of a percent.
      for (const r of f.regions.list) if (r.salesTax && (!r.salesTax.label.trim() || !Number.isInteger(r.salesTax.milli) || r.salesTax.milli < 0 || r.salesTax.milli > 100000)) at(`malformed sales tax on ${r.code}`)
      for (const r of f.regions.list) if (r.signupClosed && r.salesTax) at(`${r.code} is closed to signups and also carries a sales tax`)
    }
    for (const [k, v] of Object.entries(f.examples)) if (typeof v !== 'string' || !v.trim()) at(`an empty example ${k}`)
    if (keys.includes('region') !== !!f.examples.region) at('a region field needs a region example, and an example needs the field')
    if (keys.includes('suburb') !== !!f.examples.suburb) at('a suburb field needs a suburb example, and an example needs the field')
    if (f.regions && f.examples.region && !regionOf(f, f.examples.region)) at(`the region example "${f.examples.region}" is not in its list`)
    if (f.places.regionCode && !f.regions) at('a Places region code needs a region list')
    if (f.places.regionCode && !f.places.regionFrom.length) at('a Places region code needs a level to read it from')
    if (!f.places.localityTypes.length) at('no Places locality types')
    for (const [part, slots] of [['importer', f.ai.importer], ['screenshot', f.ai.screenshot], ['scraper', f.ai.scraper]] as const) {
      for (const [k, v] of Object.entries(slots)) {
        if (typeof v !== 'string' || !v.trim()) at(`an empty AI rule ${part}.${k}`)
        else for (const m of v.matchAll(/\$\{|`/g)) at(`AI rule ${part}.${k} holds ${m[0]}`)
      }
    }
  }
  return problems
}
