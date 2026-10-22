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

export type AddressFormatKey = 'gb' | 'us' | 'ie' | 'au' | 'nz' | 'ca' | 'fr' | EuropeKey
/** europe-settings (22 October 2026): the rest of Stripe's Europe, one format each. */
export type EuropeKey = 'at' | 'be' | 'bg' | 'hr' | 'cy' | 'cz' | 'dk' | 'ee' | 'fi' | 'de' | 'gi' | 'gr' | 'hu' | 'it' | 'lv' | 'li' | 'lt' | 'lu' | 'mt' | 'nl' | 'no' | 'pl' | 'pt' | 'ro' | 'sk' | 'si' | 'es' | 'se' | 'ch'
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
  // europe-settings: "110 00" (CZ, SK, GR, SE), "00-950" (PL), "1000-001" (PT), "1012 JS" (NL), "VLT 1117" (MT), "L-1648", "LV-1050", "LT-01143"
  | 'nnn_nn' | 'nn_nnn' | 'nnnn_nnn' | 'nnnn_aa' | 'mt' | 'lu' | 'lv' | 'lt'

export interface AddressField { key: AddressFieldKey; required: boolean; label: FieldLabel }
export interface Region {
  code: string; name: string; aliases?: readonly string[]
  /** canada-1 (22 October 2026): trucks BASED here cannot sign up yet (nor move their base here) — lib/trade-area.ts refuses
   *  with `tradeArea.region_closed`, naming the region and its REASON, each said plainly in messages:
   *    'language' — HatchGrab must be available in `needsLanguage` first (Quebec: the Charter of the French language, Bill 96);
   *    'taxLines' — the region's sales tax is two taxes that must show as separate lines, which an order cannot hold yet
   *                 (canada-2, Dominic 22 Oct: Saskatchewan and Manitoba; their `salesTax` stays, for when they open). */
  signupClosed?: { reason: 'language'; needsLanguage: string } | { reason: 'taxLines' }
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
  /** france-1 (22 October 2026): a country whose prices INCLUDE tax (country_settings.prices_include_tax) and whose receipts
   *  say how much of the price is that tax: the label and the default rate (thousandths of a percent, the unit of
   *  `trucks.tax_rate_milli`; the truck may set its own). Nothing is ever ADDED to a price — the rate only words the
   *  "Dont TVA 10 % : 1,09 €" line after the total. Absent (GB, IE — every format before France): exactly as before. */
  includedTax?: RegionSalesTax
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
// "concession stands, food carts and food trucks" — Information Notice RST 26-01). ⚠️ A province with TWO taxes would be one
// line ("GST + PST", the combined rate): an order holds one tax line (lib/order-charges.ts), and Saskatchewan asks for PST as a
// separate amount on the invoice. canada-2 (Dominic, 22 October 2026): SASKATCHEWAN AND MANITOBA ARE THEREFORE CLOSED to signups
// (`signupClosed: taxLines`) until the two-line build (docs/canada-1-report.md §2.4, in the backlog); their tax stays here.
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
  { code: 'MB', name: 'Manitoba', salesTax: CA_TAX.gstRstMb, signupClosed: { reason: 'taxLines' } },
  { code: 'NB', name: 'New Brunswick', salesTax: CA_TAX.hst15 },
  { code: 'NL', name: 'Newfoundland and Labrador', salesTax: CA_TAX.hst15 },
  { code: 'NS', name: 'Nova Scotia', salesTax: CA_TAX.hst14 },
  { code: 'NT', name: 'Northwest Territories', salesTax: CA_TAX.gst },
  { code: 'NU', name: 'Nunavut', salesTax: CA_TAX.gst },
  { code: 'ON', name: 'Ontario', salesTax: CA_TAX.hst13 },
  { code: 'PE', name: 'Prince Edward Island', salesTax: CA_TAX.hst15 },
  { code: 'QC', name: 'Quebec', signupClosed: { reason: 'language', needsLanguage: 'French' } },
  { code: 'SK', name: 'Saskatchewan', salesTax: CA_TAX.gstPstSk, signupClosed: { reason: 'taxLines' } },
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

/* france-1 (22 October 2026): France — street, 5-digit code postal, ville; no region. Schedules arrive in French ("samedi
 * 14 juin", "18h-22h", "18 h 30"), so the rules say how to read them; the JSON keys are the same as every format's. */
const FR_AI: AddressAi = {
  importer: {
    knowledge: `venues and locations in {country}`,
    venueRules: `- Extract ONLY the venue name — never include the town (ville) or the code postal in venue_name
- "Place Bellecour Lyon 69002" → venue_name="Place Bellecour", town="Lyon", postcode="69002"
- "Marché de la Croix-Rousse, 69004 Lyon, 18h-22h" → venue_name="Marché de la Croix-Rousse", town="Lyon", postcode="69004"
- A French article belongs to the venue name ("Le Bistrot du Port", "La Halle"); "à"/"au"/"sur" before a town is not part of either`,
    postalRules: `CODE POSTAL RULES:
- "postcode" holds the French code postal: exactly 5 digits (e.g. "75011", "69002", "13001") — written before the town in a French address ("69002 Lyon")
- A code postal covers a whole area or district, never one building
- Paris, Lyon and Marseille have one code per arrondissement ("75011" = Paris 11e, "69002" = Lyon 2e); keep the town as "Paris", "Lyon" or "Marseille"
- A number of 5 digits next to a town is the code postal, not a street number
- Never return a region or département name; there is no "state" for France`,
    addressRules: `ADDRESS RULES:
- address is for street-level detail only — number + street (e.g. "12 rue de la République", "3 place du Marché")
- NEVER populate address with the town or the code postal — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases`,
    enrichRules: `- If you have a venue name and town but no code postal → give the venue's code postal only if you are certain of it
- If you have a venue name but no town → determine the town from your knowledge of that venue in {country}
- If the venue name is ambiguous and you have a code postal or town → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""
- French dates and times: "samedi 14 juin" → 14/06; "18h", "18 h", "18h00" → "18:00"; "18h30", "18 h 30" → "18:30"; "midi" → "12:00"; "de 18h à 22h" → start 18:00, end 22:00`,
    examples: `Input: "Mercredi 3 juin Place Bellecour 69002 Lyon"
Output: {"event_date":"03/06/{year}","start_time":"","end_time":"","venue_name":"Place Bellecour","town":"Lyon","postcode":"69002"}

Input: "Sam. 14 juin — Marché de la Croix-Rousse, Lyon, 18h-22h"
Output: {"event_date":"14/06/{year}","start_time":"18:00","end_time":"22:00","venue_name":"Marché de la Croix-Rousse","town":"Lyon","postcode":""}

Input: "Vendredi 20/06 Parking du Leclerc à Villeurbanne de 11 h 30 à 14 h"
Output: {"event_date":"20/06/{year}","start_time":"11:30","end_time":"14:00","venue_name":"Parking du Leclerc","town":"Villeurbanne","postcode":""}`,
    outputShape: `"town":"Ville","postcode":"CODE POSTAL"`,
  },
  screenshot: {
    locationLines: `- Extract ONLY the venue name into "Venue Name" — never include the town or the code postal in it.
- Put the town (ville) in "Village", and the code postal, if one is shown, in "Postcode".
- A French code postal is 5 digits, written before the town ("69002 Lyon"). If no code postal is shown, use "".
- French times: "18h" = "18:00", "18h30" or "18 h 30" = "18:30".`,
    eventShape: `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Lyon", "Postcode": "69002" }`,
  },
  scraper: {
    venueRules: `VENUE RULES: "venue_name" = ONLY the venue name. "town" = the town or city (ville) it is in. "postcode" = the 5-digit code postal (e.g. "69002"), otherwise "".`,
    townRules: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the town is EMBEDDED inside the venue name, SPLIT it out —
put the place-name in "town" and keep "venue_name" as just the venue name ("Marché de Villeurbanne" -> venue
"Marché", town "Villeurbanne" only when the town is clearly a place-name added to a generic venue). Never leave a
town buried in venue_name. If the town truly cannot be determined, use "".`,
    examples: `  "Place Bellecour Lyon 69002"      -> {"venue_name":"Place Bellecour","town":"Lyon","postcode":"69002"}
  "Parking du Leclerc, Villeurbanne" -> {"venue_name":"Parking du Leclerc","town":"Villeurbanne"}`,
    outputShape: `"town":"Ville","postcode":"Code postal or empty"`,
  },
}

// ── The templates the GB/US displays already wrote, as data (each one byte-identical to the code it replaced) ───────
const COMMA_VENUE_LOCALITY_POSTAL: AddressTemplate = { sep: ', ', parts: ['{venue}', '{locality}', '{postalCode}'] }
const DOT_LOCALITY_POSTAL: AddressTemplate = { sep: ' · ', parts: ['{locality}', '{postalCode}'] }


// ══ europe-settings (22 October 2026, docs/europe-settings-report.md §3) — THE REST OF STRIPE'S EUROPE ═══════════════
// One format per country, built by one factory from a row of FACTS: the postal code's shape and where it is written, the
// local word for it, a worked example, the region list where locals write one (Italy's province), the takeaway-food VAT the
// prices include (`includedTax`, as France's TVA) and the language schedules arrive in. Two shapes cover all of them:
//   • code BEFORE the town — "1010 Wien", "00-950 Warszawa", "1012 JS Amsterdam" (every country but two);
//   • code AFTER the town  — "Valletta VLT 1117" (Malta), "Gibraltar GX11 1AA" (Gibraltar).
// ⛔ NO COUNTRY-CODE BRANCHES: the shape is the row's `before`, never the key.
interface EuropeRow {
  key: EuropeKey
  country: string
  adminLabel: string
  postal: { pattern: string; normaliser: PostalNormaliser; example: string; label: PostalLabel; local: string; desc: string }
  /** The postal code is written before the town ("1010 Wien") — false for Malta and Gibraltar ("Valletta VLT 1117"). */
  before: boolean
  /** After the town AND after a comma ("Rīga, LV-1050") — Latvia. Only with `before: false`. */
  comma?: true
  examples: { venue: string; street: string; locality: string; paste: string }
  /** The language schedules usually arrive in, and how times are written in it (for the AI rules). */
  language: string
  timeHint: string
  regions?: { list: readonly Region[]; label: RegionLabel; example: string; local: string }
  /** Undefined where there is no VAT (Gibraltar): no « included » line. */
  includedTax?: RegionSalesTax
}

function europeAi(r: EuropeRow): AddressAi {
  const ex = r.examples, pc = r.postal.example
  const townCode = r.before ? `${pc} ${ex.locality}` : `${ex.locality}${r.comma ? ',' : ''} ${pc}`
  const placed = `"${townCode}"`
  const region = r.regions
  const regionRule = region
    ? `\n- "state" holds the ${region.local} abbreviation when one is written after the town (e.g. "${region.example}"); otherwise leave it ""`
    : `\n- There is no region or state in ${r.country} addresses — never return one`
  const outPostal = region ? `"town":"Town","state":"${region.example}","postcode":"${pc}"` : `"town":"Town","postcode":"${pc}"`
  const regionPart = region ? `,"state":"${region.example}"` : ''
  return {
    importer: {
      knowledge: 'venues and locations in {country}',
      venueRules: `- Extract ONLY the venue name — never include the town or the ${r.postal.local} in venue_name
- "${ex.venue} ${ex.locality} ${pc}" → venue_name="${ex.venue}", town="${ex.locality}", postcode="${pc}"
- "${ex.venue}, ${townCode}, 18:00-22:00" → venue_name="${ex.venue}", town="${ex.locality}", postcode="${pc}"`,
      postalRules: `POSTAL CODE RULES:
- "postcode" holds the ${r.postal.local}: ${r.postal.desc} (e.g. "${pc}") — written ${r.before ? 'BEFORE' : r.comma ? 'AFTER (and after a comma)' : 'AFTER'} the town in an address (${placed})
- Always extract the FULL postal code as one unit, even when it is split across two lines
- A postal code covers an area, never one building
- A postal code alone is never a town${regionRule}`,
      addressRules: `ADDRESS RULES:
- address is for street-level detail only — the street and number (e.g. "${ex.street}")
- NEVER populate address with the town or the postal code — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases`,
      enrichRules: `- If you have a venue name and town but no postal code → give the venue's postal code only if you are certain of it
- If you have a venue name but no town → determine the town from your knowledge of that venue in {country}
- If the venue name is ambiguous and you have a postal code or town → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""
- Schedules are often written in ${r.language}: read its day and month names, and times such as ${r.timeHint} → 24-hour "HH:MM"`,
      examples: `Input: "${ex.venue} ${ex.locality} ${pc}"
Output: {"event_date":"03/06/{year}","start_time":"","end_time":"","venue_name":"${ex.venue}","town":"${ex.locality}"${regionPart},"postcode":"${pc}"}

Input: "${ex.venue}, ${ex.locality}, 18:00-22:00"
Output: {"event_date":"14/06/{year}","start_time":"18:00","end_time":"22:00","venue_name":"${ex.venue}","town":"${ex.locality}"${regionPart},"postcode":""}`,
      outputShape: outPostal,
    },
    screenshot: {
      locationLines: `- Extract ONLY the venue name into "Venue Name" — never include the town or the postal code in it.
- Put the town in "Village", and the ${r.postal.local}, if one is shown, in "Postcode".${region ? `\n- Put the ${region.local} abbreviation, if one is shown, in "State" (e.g. "${region.example}").` : ''}
- ${r.country}'s postal codes look like "${pc}" (${r.postal.desc}). If none is shown, use "".
- Times may be written ${r.timeHint}: return 24-hour "HH:MM".`,
      eventShape: `{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "${ex.locality}"${region ? `, "State": "${region.example}"` : ''}, "Postcode": "${pc}" }`,
    },
    scraper: {
      venueRules: `VENUE RULES: "venue_name" = ONLY the venue name. "town" = the town or city it is in. "postcode" = the ${r.postal.local} (e.g. "${pc}"), otherwise "".${region ? ` "state" = the ${region.local} abbreviation (e.g. "${region.example}") when one is written, otherwise "".` : ''}`,
      townRules: `TOWN RULES (IMPORTANT): ALWAYS populate "town". If the town is EMBEDDED inside the venue name, SPLIT it out —
put the place-name in "town" and keep "venue_name" as just the venue name. Never leave a town buried in venue_name. If the
town truly cannot be determined, use "".`,
      examples: `  "${ex.paste}" -> {"venue_name":"${ex.venue}","town":"${ex.locality}"}
  "${ex.venue} ${placed.slice(1, -1)}" -> {"venue_name":"${ex.venue}","town":"${ex.locality}","postcode":"${pc}"}`,
      outputShape: region ? `"town":"Town","state":"${region.example} or empty","postcode":"Postal code or empty"` : `"town":"Town","postcode":"Postal code or empty"`,
    },
  }
}

function europeFormat(r: EuropeRow): AddressFormat {
  const before = r.before
  const codeTown = before ? '{postalCode} {locality}' : '{locality} {postalCode}'
  const withRegion = r.regions ? `${codeTown} {region}` : codeTown
  // Latvia: the town and the code are two comma-separated parts, so a missing code leaves no stray comma.
  const townParts = r.comma ? ['{locality}', '{postalCode}'] : [withRegion]
  return {
    key: r.key,
    adminLabel: r.adminLabel,
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'townOrCity' },
      ...(r.regions ? [{ key: 'region' as const, required: false, label: r.regions.label }] : []),
      { key: 'postalCode', required: false, label: r.postal.label },
    ],
    regions: r.regions ? { list: r.regions.list, shownAs: 'code' } : null,
    postalCode: { pattern: r.postal.pattern, normaliser: r.postal.normaliser, example: r.postal.example, identifiesPremises: false },
    entry: { customersSee: true, postalCheck: true, requiredMarks: true, regionInput: r.regions ? 'select' : 'text', sublines: 'area', reviewAndPlaces: true },
    examples: {
      venue: r.examples.venue, addressLine: `${r.examples.street}, ${r.examples.locality}`, locality: r.examples.locality,
      ...(r.regions ? { region: r.regions.example } : {}), importPostalCode: r.postal.example, paste: r.examples.paste,
    },
    templates: {
      line: { sep: ', ', parts: ['{venue}', ...townParts] },
      area: [{ sep: r.comma ? ', ' : ' ', parts: townParts }],
      calendar: { sep: ', ', parts: ['{venue}', ...townParts] },
      geocode: { sep: ', ', parts: ['{venue}', ...(r.comma ? townParts : [codeTown]), '{country}'] },
    },
    places: r.regions
      ? { localityTypes: ['locality', 'postal_town'], regionFrom: ['administrative_area_level_2'], regionCode: 'exact' }
      : { localityTypes: ['locality', 'postal_town'], regionFrom: [], regionCode: null },
    ai: europeAi(r),
    ...(r.includedTax ? { includedTax: r.includedTax } : {}),
  }
}

// The VAT a takeaway hot-food price INCLUDES, per country (label as locals write it on a receipt; thousandths of a percent).
// Each is sourced in docs/europe-settings-report.md §2; the truck may set its own rate (Manage › Payments).
const TAX_AT: RegionSalesTax | undefined = { label: 'USt.', milli: 10000 }
const TAX_BE: RegionSalesTax | undefined = { label: 'btw', milli: 6000 }
const TAX_BG: RegionSalesTax | undefined = { label: 'ДДС', milli: 20000 }
const TAX_HR: RegionSalesTax | undefined = { label: 'PDV', milli: 13000 }
const TAX_CY: RegionSalesTax | undefined = { label: 'ΦΠΑ', milli: 5000 }
const TAX_CZ: RegionSalesTax | undefined = { label: 'DPH', milli: 12000 }
const TAX_DK: RegionSalesTax | undefined = { label: 'moms', milli: 25000 }
const TAX_EE: RegionSalesTax | undefined = { label: 'km', milli: 24000 }
const TAX_FI: RegionSalesTax | undefined = { label: 'ALV', milli: 13500 }
const TAX_DE: RegionSalesTax | undefined = { label: 'MwSt.', milli: 7000 }
const TAX_GI: RegionSalesTax | undefined = undefined   // no VAT in Gibraltar
const TAX_GR: RegionSalesTax | undefined = { label: 'ΦΠΑ', milli: 13000 }
const TAX_HU: RegionSalesTax | undefined = { label: 'ÁFA', milli: 27000 }
const TAX_IT: RegionSalesTax | undefined = { label: 'IVA', milli: 10000 }
const TAX_LV: RegionSalesTax | undefined = { label: 'PVN', milli: 21000 }
const TAX_LI: RegionSalesTax | undefined = { label: 'MWST', milli: 2600 }
const TAX_LT: RegionSalesTax | undefined = { label: 'PVM', milli: 21000 }
const TAX_LU: RegionSalesTax | undefined = { label: 'TVA', milli: 3000 }
const TAX_MT: RegionSalesTax | undefined = { label: 'VAT', milli: 18000 }
const TAX_NL: RegionSalesTax | undefined = { label: 'btw', milli: 9000 }
const TAX_NO: RegionSalesTax | undefined = { label: 'MVA', milli: 15000 }
const TAX_PL: RegionSalesTax | undefined = { label: 'VAT', milli: 8000 }
const TAX_PT: RegionSalesTax | undefined = { label: 'IVA', milli: 13000 }
const TAX_RO: RegionSalesTax | undefined = { label: 'TVA', milli: 11000 }
const TAX_SK: RegionSalesTax | undefined = { label: 'DPH', milli: 19000 }
const TAX_SI: RegionSalesTax | undefined = { label: 'DDV', milli: 9500 }
const TAX_ES: RegionSalesTax | undefined = { label: 'IVA', milli: 10000 }
const TAX_SE: RegionSalesTax | undefined = { label: 'moms', milli: 6000 }
const TAX_CH: RegionSalesTax | undefined = { label: 'MWST', milli: 2600 }

const IT_PROVINCES: readonly Region[] = [
  { code: 'AG', name: "Agrigento" }, { code: 'AL', name: "Alessandria" }, { code: 'AN', name: "Ancona" }, { code: 'AO', name: "Aosta" },
  { code: 'AP', name: "Ascoli Piceno" }, { code: 'AQ', name: "L'Aquila" }, { code: 'AR', name: "Arezzo" }, { code: 'AT', name: "Asti" },
  { code: 'AV', name: "Avellino" }, { code: 'BA', name: "Bari" }, { code: 'BG', name: "Bergamo" }, { code: 'BI', name: "Biella" },
  { code: 'BL', name: "Belluno" }, { code: 'BN', name: "Benevento" }, { code: 'BO', name: "Bologna" }, { code: 'BR', name: "Brindisi" },
  { code: 'BS', name: "Brescia" }, { code: 'BT', name: "Barletta-Andria-Trani" }, { code: 'BZ', name: "Bolzano" }, { code: 'CA', name: "Cagliari" },
  { code: 'CB', name: "Campobasso" }, { code: 'CE', name: "Caserta" }, { code: 'CH', name: "Chieti" }, { code: 'CL', name: "Caltanissetta" },
  { code: 'CN', name: "Cuneo" }, { code: 'CO', name: "Como" }, { code: 'CR', name: "Cremona" }, { code: 'CS', name: "Cosenza" },
  { code: 'CT', name: "Catania" }, { code: 'CZ', name: "Catanzaro" }, { code: 'EN', name: "Enna" }, { code: 'FC', name: "Forlì-Cesena" },
  { code: 'FE', name: "Ferrara" }, { code: 'FG', name: "Foggia" }, { code: 'FI', name: "Firenze" }, { code: 'FM', name: "Fermo" },
  { code: 'FR', name: "Frosinone" }, { code: 'GE', name: "Genova" }, { code: 'GO', name: "Gorizia" }, { code: 'GR', name: "Grosseto" },
  { code: 'IM', name: "Imperia" }, { code: 'IS', name: "Isernia" }, { code: 'KR', name: "Crotone" }, { code: 'LC', name: "Lecco" },
  { code: 'LE', name: "Lecce" }, { code: 'LI', name: "Livorno" }, { code: 'LO', name: "Lodi" }, { code: 'LT', name: "Latina" },
  { code: 'LU', name: "Lucca" }, { code: 'MB', name: "Monza e Brianza" }, { code: 'MC', name: "Macerata" }, { code: 'ME', name: "Messina" },
  { code: 'MI', name: "Milano" }, { code: 'MN', name: "Mantova" }, { code: 'MO', name: "Modena" }, { code: 'MS', name: "Massa-Carrara" },
  { code: 'MT', name: "Matera" }, { code: 'NA', name: "Napoli" }, { code: 'NO', name: "Novara" }, { code: 'NU', name: "Nuoro" },
  { code: 'OR', name: "Oristano" }, { code: 'PA', name: "Palermo" }, { code: 'PC', name: "Piacenza" }, { code: 'PD', name: "Padova" },
  { code: 'PE', name: "Pescara" }, { code: 'PG', name: "Perugia" }, { code: 'PI', name: "Pisa" }, { code: 'PN', name: "Pordenone" },
  { code: 'PO', name: "Prato" }, { code: 'PR', name: "Parma" }, { code: 'PT', name: "Pistoia" }, { code: 'PU', name: "Pesaro e Urbino" },
  { code: 'PV', name: "Pavia" }, { code: 'PZ', name: "Potenza" }, { code: 'RA', name: "Ravenna" }, { code: 'RC', name: "Reggio Calabria" },
  { code: 'RE', name: "Reggio Emilia" }, { code: 'RG', name: "Ragusa" }, { code: 'RI', name: "Rieti" }, { code: 'RM', name: "Roma" },
  { code: 'RN', name: "Rimini" }, { code: 'RO', name: "Rovigo" }, { code: 'SA', name: "Salerno" }, { code: 'SI', name: "Siena" },
  { code: 'SO', name: "Sondrio" }, { code: 'SP', name: "La Spezia" }, { code: 'SR', name: "Siracusa" }, { code: 'SS', name: "Sassari" },
  { code: 'SU', name: "Sud Sardegna" }, { code: 'SV', name: "Savona" }, { code: 'TA', name: "Taranto" }, { code: 'TE', name: "Teramo" },
  { code: 'TN', name: "Trento" }, { code: 'TO', name: "Torino" }, { code: 'TP', name: "Trapani" }, { code: 'TR', name: "Terni" },
  { code: 'TS', name: "Trieste" }, { code: 'TV', name: "Treviso" }, { code: 'UD', name: "Udine" }, { code: 'VA', name: "Varese" },
  { code: 'VB', name: "Verbano-Cusio-Ossola" }, { code: 'VC', name: "Vercelli" }, { code: 'VE', name: "Venezia" }, { code: 'VI', name: "Vicenza" },
  { code: 'VR', name: "Verona" }, { code: 'VT', name: "Viterbo" }, { code: 'VV', name: "Vibo Valentia" },
]
const EUROPE_ROWS: readonly EuropeRow[] = [
  {
    key: "at", country: "Austria", adminLabel: "Austria — Postleitzahl, Ort",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "1010", label: "postalCode", local: "Postleitzahl (PLZ)", desc: "4 digits" },
    before: true,
    examples: { venue: "Stephansplatz", street: "Graben 21", locality: "Wien", paste: "Stephansplatz, Wien" },
    language: "German", timeHint: "\"18 Uhr\", \"18:30 Uhr\"",
    includedTax: TAX_AT,
  },
  {
    key: "be", country: "Belgium", adminLabel: "Belgium — postcode / code postal, ville",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "1000", label: "postalCode", local: "postcode (code postal)", desc: "4 digits" },
    before: true,
    examples: { venue: "Grand-Place", street: "Rue au Beurre 1", locality: "Bruxelles", paste: "Grand-Place, Bruxelles" },
    language: "Dutch or French", timeHint: "\"18u\", \"18.30 uur\", \"18h30\"",
    includedTax: TAX_BE,
  },
  {
    key: "bg", country: "Bulgaria", adminLabel: "Bulgaria — пощенски код, град",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "1000", label: "postalCode", local: "пощенски код (postal code)", desc: "4 digits" },
    before: true,
    examples: { venue: "Ploshtad Nezavisimost", street: "bul. Vitosha 1", locality: "Sofia", paste: "Ploshtad Nezavisimost, Sofia" },
    language: "Bulgarian", timeHint: "\"18:00 ч.\", \"18.30\"",
    includedTax: TAX_BG,
  },
  {
    key: "hr", country: "Croatia", adminLabel: "Croatia — poštanski broj, mjesto",
    postal: { pattern: "^\\d{5}$", normaliser: "digits", example: "10000", label: "postalCode", local: "poštanski broj", desc: "5 digits" },
    before: true,
    examples: { venue: "Trg bana Jelačića", street: "Ilica 1", locality: "Zagreb", paste: "Trg bana Jelačića, Zagreb" },
    language: "Croatian", timeHint: "\"18 h\", \"18.30\"",
    includedTax: TAX_HR,
  },
  {
    key: "cy", country: "Cyprus", adminLabel: "Cyprus — postal code, town",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "1010", label: "postalCode", local: "postal code (ταχυδρομικός κώδικας)", desc: "4 digits" },
    before: true,
    examples: { venue: "Eleftheria Square", street: "Ledras 1", locality: "Nicosia", paste: "Eleftheria Square, Nicosia" },
    language: "Greek or English", timeHint: "\"18:00\", \"6pm\"",
    includedTax: TAX_CY,
  },
  {
    key: "cz", country: "Czech Republic", adminLabel: "Czech Republic — PSČ, obec",
    postal: { pattern: "^\\d{3} \\d{2}$", normaliser: "nnn_nn", example: "110 00", label: "postalCode", local: "PSČ (postal code)", desc: "5 digits written \"NNN NN\"" },
    before: true,
    examples: { venue: "Staroměstské náměstí", street: "Václavské náměstí 1", locality: "Praha", paste: "Staroměstské náměstí, Praha" },
    language: "Czech", timeHint: "\"18 h\", \"18.30\", \"od 18:00\"",
    includedTax: TAX_CZ,
  },
  {
    key: "dk", country: "Denmark", adminLabel: "Denmark — postnummer, by",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "8000", label: "postalCode", local: "postnummer", desc: "4 digits" },
    before: true,
    examples: { venue: "Aarhus Street Food", street: "Ny Banegårdsgade 46", locality: "Aarhus", paste: "Aarhus Street Food, Aarhus" },
    language: "Danish", timeHint: "\"kl. 18\", \"18.30\"",
    includedTax: TAX_DK,
  },
  {
    key: "ee", country: "Estonia", adminLabel: "Estonia — sihtnumber, linn",
    postal: { pattern: "^\\d{5}$", normaliser: "digits", example: "10146", label: "postalCode", local: "sihtnumber (postal code)", desc: "5 digits" },
    before: true,
    examples: { venue: "Raekoja plats", street: "Viru 1", locality: "Tallinn", paste: "Raekoja plats, Tallinn" },
    language: "Estonian", timeHint: "\"kell 18\", \"18.30\"",
    includedTax: TAX_EE,
  },
  {
    key: "fi", country: "Finland", adminLabel: "Finland — postinumero, toimipaikka",
    postal: { pattern: "^\\d{5}$", normaliser: "digits", example: "00100", label: "postalCode", local: "postinumero (postal code)", desc: "5 digits" },
    before: true,
    examples: { venue: "Kauppatori", street: "Pohjoisesplanadi 1", locality: "Helsinki", paste: "Kauppatori, Helsinki" },
    language: "Finnish or Swedish", timeHint: "\"klo 18\", \"18.30\"",
    includedTax: TAX_FI,
  },
  {
    key: "de", country: "Germany", adminLabel: "Germany — Postleitzahl, Ort",
    postal: { pattern: "^\\d{5}$", normaliser: "digits", example: "10117", label: "postalCode", local: "Postleitzahl (PLZ)", desc: "5 digits" },
    before: true,
    examples: { venue: "Gendarmenmarkt", street: "Friedrichstraße 1", locality: "Berlin", paste: "Gendarmenmarkt, Berlin" },
    language: "German", timeHint: "\"18 Uhr\", \"18:30 Uhr\", \"ab 18 Uhr\"",
    includedTax: TAX_DE,
  },
  {
    key: "gi", country: "Gibraltar", adminLabel: "Gibraltar — postcode GX11 1AA",
    postal: { pattern: "^GX11 1AA$", normaliser: "gb", example: "GX11 1AA", label: "postcode", local: "postcode", desc: "\"GX11 1AA\" — one postcode for all of Gibraltar" },
    before: false,
    examples: { venue: "Casemates Square", street: "Main Street 1", locality: "Gibraltar", paste: "Casemates Square, Gibraltar" },
    language: "English", timeHint: "\"6pm\", \"18:00\"",
    includedTax: TAX_GI,
  },
  {
    key: "gr", country: "Greece", adminLabel: "Greece — Τ.Κ., πόλη",
    postal: { pattern: "^\\d{3} \\d{2}$", normaliser: "nnn_nn", example: "105 57", label: "postalCode", local: "Τ.Κ. (postal code)", desc: "5 digits written \"NNN NN\"" },
    before: true,
    examples: { venue: "Plateia Syntagmatos", street: "Ermou 1", locality: "Athens", paste: "Plateia Syntagmatos, Athens" },
    language: "Greek", timeHint: "\"18:00\", \"6 μ.μ.\"",
    includedTax: TAX_GR,
  },
  {
    key: "hu", country: "Hungary", adminLabel: "Hungary — irányítószám, település",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "1051", label: "postalCode", local: "irányítószám (postal code)", desc: "4 digits" },
    before: true,
    examples: { venue: "Vörösmarty tér", street: "Váci utca 1", locality: "Budapest", paste: "Vörösmarty tér, Budapest" },
    language: "Hungarian", timeHint: "\"18 órától\", \"18:30\"",
    includedTax: TAX_HU,
  },
  {
    key: "it", country: "Italy", adminLabel: "Italy — CAP, comune, provincia",
    postal: { pattern: "^\\d{5}$", normaliser: "digits", example: "20122", label: "postalCode", local: "CAP (codice di avviamento postale)", desc: "5 digits" },
    before: true,
    examples: { venue: "Piazza del Duomo", street: "Via Dante 1", locality: "Milano", paste: "Piazza del Duomo, Milano" },
    language: "Italian", timeHint: "\"ore 18\", \"18:30\", \"dalle 18\"",
    regions: { list: IT_PROVINCES, label: 'province', example: 'MI', local: 'province (sigla)' },
    includedTax: TAX_IT,
  },
  {
    key: "lv", country: "Latvia", adminLabel: "Latvia — pilsēta, LV-pasta indekss",
    postal: { pattern: "^LV-\\d{4}$", normaliser: "lv", example: "LV-1050", label: "postalCode", local: "pasta indekss (postal code)", desc: "\"LV-\" and 4 digits" },
    before: false, comma: true,
    examples: { venue: "Doma laukums", street: "Kaļķu iela 1", locality: "Rīga", paste: "Doma laukums, Rīga" },
    language: "Latvian", timeHint: "\"plkst. 18\", \"18.30\"",
    includedTax: TAX_LV,
  },
  {
    key: "li", country: "Liechtenstein", adminLabel: "Liechtenstein — Postleitzahl, Ort",
    postal: { pattern: "^94(8[5-9]|9[0-8])$", normaliser: "digits", example: "9490", label: "postalCode", local: "Postleitzahl (PLZ)", desc: "4 digits, 9485–9498" },
    before: true,
    examples: { venue: "Peter-Kaiser-Platz", street: "Städtle 1", locality: "Vaduz", paste: "Peter-Kaiser-Platz, Vaduz" },
    language: "German", timeHint: "\"18 Uhr\", \"18.30 Uhr\"",
    includedTax: TAX_LI,
  },
  {
    key: "lt", country: "Lithuania", adminLabel: "Lithuania — LT-pašto kodas, miestas",
    postal: { pattern: "^LT-\\d{5}$", normaliser: "lt", example: "LT-01143", label: "postalCode", local: "pašto kodas (postal code)", desc: "\"LT-\" and 5 digits" },
    before: true,
    examples: { venue: "Katedros aikštė", street: "Gedimino pr. 1", locality: "Vilnius", paste: "Katedros aikštė, Vilnius" },
    language: "Lithuanian", timeHint: "\"18 val.\", \"18:30\"",
    includedTax: TAX_LT,
  },
  {
    key: "lu", country: "Luxembourg", adminLabel: "Luxembourg — L-code postal, localité",
    postal: { pattern: "^L-\\d{4}$", normaliser: "lu", example: "L-1648", label: "postalCode", local: "code postal", desc: "\"L-\" and 4 digits" },
    before: true,
    examples: { venue: "Place Guillaume II", street: "Grand-Rue 1", locality: "Luxembourg", paste: "Place Guillaume II, Luxembourg" },
    language: "French, German or Luxembourgish", timeHint: "\"18h00\", \"18 Uhr\"",
    includedTax: TAX_LU,
  },
  {
    key: "mt", country: "Malta", adminLabel: "Malta — locality, postcode",
    postal: { pattern: "^[A-Z]{3} \\d{4}$", normaliser: "mt", example: "VLT 1117", label: "postcode", local: "postcode", desc: "3 letters, a space and 4 digits" },
    before: false,
    examples: { venue: "St George’s Square", street: "Republic Street 1", locality: "Valletta", paste: "St George’s Square, Valletta" },
    language: "English or Maltese", timeHint: "\"6pm\", \"18:00\"",
    includedTax: TAX_MT,
  },
  {
    key: "nl", country: "Netherlands", adminLabel: "Netherlands — postcode, plaats",
    postal: { pattern: "^\\d{4} [A-Z]{2}$", normaliser: "nnnn_aa", example: "1012 JS", label: "postalCode", local: "postcode", desc: "4 digits, a space and 2 letters" },
    before: true,
    examples: { venue: "Dam", street: "Damrak 1", locality: "Amsterdam", paste: "Dam, Amsterdam" },
    language: "Dutch", timeHint: "\"18.00 uur\", \"vanaf 18 uur\"",
    includedTax: TAX_NL,
  },
  {
    key: "no", country: "Norway", adminLabel: "Norway — postnummer, sted",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "0150", label: "postalCode", local: "postnummer", desc: "4 digits" },
    before: true,
    examples: { venue: "Rådhusplassen", street: "Karl Johans gate 1", locality: "Oslo", paste: "Rådhusplassen, Oslo" },
    language: "Norwegian", timeHint: "\"kl. 18\", \"18.30\"",
    includedTax: TAX_NO,
  },
  {
    key: "pl", country: "Poland", adminLabel: "Poland — kod pocztowy, miejscowość",
    postal: { pattern: "^\\d{2}-\\d{3}$", normaliser: "nn_nnn", example: "31-042", label: "postalCode", local: "kod pocztowy (postal code)", desc: "\"NN-NNN\"" },
    before: true,
    examples: { venue: "Rynek Główny", street: "ul. Floriańska 1", locality: "Kraków", paste: "Rynek Główny, Kraków" },
    language: "Polish", timeHint: "\"od 18:00\", \"18.30\", \"godz. 18\"",
    includedTax: TAX_PL,
  },
  {
    key: "pt", country: "Portugal", adminLabel: "Portugal — código postal, localidade",
    postal: { pattern: "^\\d{4}-\\d{3}$", normaliser: "nnnn_nnn", example: "1100-148", label: "postalCode", local: "código postal", desc: "\"NNNN-NNN\"" },
    before: true,
    examples: { venue: "Praça do Comércio", street: "Rua Augusta 1", locality: "Lisboa", paste: "Praça do Comércio, Lisboa" },
    language: "Portuguese", timeHint: "\"18h\", \"18h30\", \"às 18:00\"",
    includedTax: TAX_PT,
  },
  {
    key: "ro", country: "Romania", adminLabel: "Romania — cod poștal, localitate",
    postal: { pattern: "^\\d{6}$", normaliser: "digits", example: "030167", label: "postalCode", local: "cod poștal (postal code)", desc: "6 digits" },
    before: true,
    examples: { venue: "Piața Universității", street: "Bulevardul Regina Elisabeta 1", locality: "București", paste: "Piața Universității, București" },
    language: "Romanian", timeHint: "\"ora 18\", \"18:30\"",
    includedTax: TAX_RO,
  },
  {
    key: "sk", country: "Slovakia", adminLabel: "Slovakia — PSČ, obec",
    postal: { pattern: "^\\d{3} \\d{2}$", normaliser: "nnn_nn", example: "811 01", label: "postalCode", local: "PSČ (postal code)", desc: "5 digits written \"NNN NN\"" },
    before: true,
    examples: { venue: "Hlavné námestie", street: "Michalská 1", locality: "Bratislava", paste: "Hlavné námestie, Bratislava" },
    language: "Slovak", timeHint: "\"od 18:00\", \"18.30 h\"",
    includedTax: TAX_SK,
  },
  {
    key: "si", country: "Slovenia", adminLabel: "Slovenia — poštna številka, kraj",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "1000", label: "postalCode", local: "poštna številka (postal code)", desc: "4 digits" },
    before: true,
    examples: { venue: "Prešernov trg", street: "Čopova ulica 1", locality: "Ljubljana", paste: "Prešernov trg, Ljubljana" },
    language: "Slovenian", timeHint: "\"ob 18h\", \"18.30\"",
    includedTax: TAX_SI,
  },
  {
    key: "es", country: "Spain", adminLabel: "Spain — código postal, municipio",
    postal: { pattern: "^\\d{5}$", normaliser: "digits", example: "28012", label: "postalCode", local: "código postal", desc: "5 digits" },
    before: true,
    examples: { venue: "Plaza Mayor", street: "Calle Mayor 1", locality: "Madrid", paste: "Plaza Mayor, Madrid" },
    language: "Spanish (or Catalan, Basque, Galician)", timeHint: "\"18:00 h\", \"a las 18h\"",
    includedTax: TAX_ES,
  },
  {
    key: "se", country: "Sweden", adminLabel: "Sweden — postnummer, postort",
    postal: { pattern: "^\\d{3} \\d{2}$", normaliser: "nnn_nn", example: "111 29", label: "postalCode", local: "postnummer", desc: "5 digits written \"NNN NN\"" },
    before: true,
    examples: { venue: "Stortorget", street: "Västerlånggatan 1", locality: "Stockholm", paste: "Stortorget, Stockholm" },
    language: "Swedish", timeHint: "\"kl. 18\", \"18.30\"",
    includedTax: TAX_SE,
  },
  {
    key: "ch", country: "Switzerland", adminLabel: "Switzerland — PLZ / NPA, Ort",
    postal: { pattern: "^\\d{4}$", normaliser: "digits", example: "8001", label: "postalCode", local: "Postleitzahl (PLZ) / NPA", desc: "4 digits" },
    before: true,
    examples: { venue: "Paradeplatz", street: "Bahnhofstrasse 1", locality: "Zürich", paste: "Paradeplatz, Zürich" },
    language: "German, French or Italian", timeHint: "\"18 Uhr\", \"18h00\", \"ore 18\"",
    includedTax: TAX_CH,
  },
]


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
  // france-1 (22 October 2026): "12 rue de la République, 69002 Lyon" — the code postal BEFORE the town, no region.
  // A code postal covers a whole commune or arrondissement, never one premises.
  fr: {
    key: 'fr',
    adminLabel: 'France — code postal, ville',
    fields: [
      { key: 'street', required: false, label: 'street' },
      { key: 'locality', required: true, label: 'city' },
      { key: 'postalCode', required: false, label: 'postalCode' },
    ],
    regions: null,
    postalCode: { pattern: '^\\d{5}$', normaliser: 'digits', example: '69002', identifiesPremises: false },
    entry: { customersSee: true, postalCheck: true, requiredMarks: true, regionInput: 'text', sublines: 'area', reviewAndPlaces: true },
    examples: { venue: 'Place Bellecour', addressLine: '12 rue de la République, Lyon', locality: 'Lyon', importPostalCode: '69002', paste: 'Place Bellecour, Lyon' },
    templates: {
      line: { sep: ', ', parts: ['{venue}', '{postalCode} {locality}'] },
      area: [{ sep: ' ', parts: ['{postalCode}', '{locality}'] }],
      calendar: { sep: ', ', parts: ['{venue}', '{postalCode} {locality}'] },
      geocode: { sep: ', ', parts: ['{venue}', '{postalCode} {locality}', '{country}'] },
    },
    places: { localityTypes: ['locality'], regionFrom: [], regionCode: null },
    ai: FR_AI,
    // TVA on hot food and non-alcoholic drinks sold to take away, for immediate consumption: 10 % (CGI art. 279 m and n;
    // entreprendre.service-public.gouv.fr F22399). Sealed food kept for later is 5,5 %, alcohol 20 % — the truck sets its
    // own rate when its sales are mostly those (docs/france-1-report.md §2).
    includedTax: { label: 'TVA', milli: 10000 },
  },
  // europe-settings (22 October 2026): the rest of Stripe's Europe, built from EUROPE_ROWS (above), in its order.
  ...(Object.fromEntries(EUROPE_ROWS.map(r => [r.key, europeFormat(r)])) as Record<EuropeKey, AddressFormat>),
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
/** france-1: the tax a format's prices INCLUDE, by default (null for every format but France's). */
export function includedTaxOf(formatValue: unknown): RegionSalesTax | null {
  return addressFormatOf(formatValue)?.includedTax ?? null
}

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
  // europe-settings: tidy only what clearly is the code; anything else is handed back trimmed (the check then warns).
  /** "11000" → "110 00" (CZ, SK, GR, SE). */
  nnn_nn: s => { const c = s.replace(/\s+/g, ''); return /^\d{5}$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3)}` : s.trim() },
  /** "31042" / "31 042" → "31-042" (PL). */
  nn_nnn: s => { const c = s.replace(/[\s-]+/g, ''); return /^\d{5}$/.test(c) ? `${c.slice(0, 2)}-${c.slice(2)}` : s.trim() },
  /** "1100148" → "1100-148" (PT). */
  nnnn_nnn: s => { const c = s.replace(/[\s-]+/g, ''); return /^\d{7}$/.test(c) ? `${c.slice(0, 4)}-${c.slice(4)}` : s.trim() },
  /** "1012js" → "1012 JS" (NL). */
  nnnn_aa: s => { const c = s.toUpperCase().replace(/\s+/g, ''); return /^\d{4}[A-Z]{2}$/.test(c) ? `${c.slice(0, 4)} ${c.slice(4)}` : s.trim().toUpperCase() },
  /** "vlt1117" → "VLT 1117" (MT). */
  mt: s => { const c = s.toUpperCase().replace(/\s+/g, ''); return /^[A-Z]{3}\d{4}$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3)}` : s.trim().toUpperCase() },
  /** "1648" / "l1648" → "L-1648" (LU). */
  lu: s => { const c = s.toUpperCase().replace(/[\s-]+/g, '').replace(/^L/, ''); return /^\d{4}$/.test(c) ? `L-${c}` : s.trim().toUpperCase() },
  /** "1050" / "lv1050" → "LV-1050" (LV). */
  lv: s => { const c = s.toUpperCase().replace(/[\s-]+/g, '').replace(/^LV/, ''); return /^\d{4}$/.test(c) ? `LV-${c}` : s.trim().toUpperCase() },
  /** "01143" / "lt01143" → "LT-01143" (LT). */
  lt: s => { const c = s.toUpperCase().replace(/[\s-]+/g, '').replace(/^LT/, ''); return /^\d{5}$/.test(c) ? `LT-${c}` : s.trim().toUpperCase() },
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
      // canada-2: a closed region may keep its tax (Saskatchewan, Manitoba — for when they open); a language closure names it.
      for (const r of f.regions.list) if (r.signupClosed && !(r.signupClosed.reason === 'taxLines' || (r.signupClosed.reason === 'language' && r.signupClosed.needsLanguage.trim()))) at(`${r.code}: a malformed signup closure`)
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
