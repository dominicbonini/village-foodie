// scripts/scraper-prompts.js — the scraper's three schedule prompts, as functions (Phase 2D-2 Part A,
// docs/schedules-country-report.md). Moved out of scripts/run-scraper.js UNCHANGED, so a harness can build them
// and compare them byte for byte with what the scraper sent before (scripts/schedules-country-parity.cjs).
//
// 🔴 EACH TAKES THE SOURCE'S COUNTRY. Every current source is British (the Sheet and the HatchGrab trucks are
// GB), and for GB every prompt is exactly what it was. Pass A's two prompts carry no UK-only line, so their text
// is the same in every country. Pass B's prompt (buildHgPrompt) has UK place-name lines; a zip_state truck
// (the US) gets city / two-letter state / ZIP lines instead, and an mdy country one line on month-first dates.

/** Pass A, rule branch (manual / scrape_rules / weekly). Callers pass `country` too; no line depends on it. */
function buildPassARulePrompt({ site, cleanText }) {
  return `
          You are a Data Extraction Bot. 
          TRUCK NAME: "${site.name}"
          CURRENT YEAR: ${new Date().getFullYear()}
          
          TASK 1: Extract any manual rules provided in the user's hint below.
          CRITICAL HINT FROM USER: ${site.instructions || "None provided."}
          
          TASK 2: Extract EVERY recurring schedule stop found in the WEBSITE TEXT below (e.g., Monday Route, Tuesday Route). Treat "Route" as freq: "weekly".
          
          TASK 3: Look for explicit mentions that something is NOT a food truck (e.g., 'Live Music', 'Quiz Night'). Extract those into 'exclusionsToAdd'.

          RULES TO FOLLOW:
          1. Extract EACH venue as a separate JSON object. Do not combine stops.
          2. "rawTimeStart" and "rawTimeEnd" MUST be the exact times from the text (e.g., "4.00", "6.00pm").
          3. "freq" and "day" MUST BE LOWERCASE ONLY.
          4. DATE BOUNDARIES: If rules say "from [Date]" or "until [Date]", extract "startDate" and/or "endDate" in "YYYY-MM-DD" format.
          5. IGNORE PRIVATE EVENTS: Do not extract any event labeled as "private", "private party", or "private lunch".
          6. VILLAGE: Extract the town, village, or city into a separate "village" field. If the town or village truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.

          JSON FORMAT ONLY:
          {
            "events": [
              { "venue": "Wickhambrook MSC", "village": "Wickhambrook", "proof": "Saturday", "rawTimeStart": "11:45", "rawTimeEnd": "13:45", "freq": "weekly", "day": "saturday", "pos": "", "startDate": null, "endDate": null }
            ],
            "exclusionsToAdd": ["Name of non-truck"]
          }
          
          WEBSITE TEXT TO PARSE:
          ${cleanText.slice(0, 100000)}
        `;
}

/** Pass A, event branch. Callers pass `country` too; no line depends on it. */
function buildPassAEventPrompt({ site, cleanText }) {
  return `
          You are extracting food truck events for: "${site.name}".
          Current Date: ${new Date().toDateString()}.
          Current Year: ${new Date().getFullYear()}.
          
          ${site.instructions ? `\n🚨 CRITICAL USER HINT FOR THIS WEBSITE: "${site.instructions}"` : ""}
          
          TASK 1: Extract EVERY food truck event from the provided text for the schedule shown.
          TASK 2: Look for explicit mentions that something is NOT a food truck (e.g., 'Live Music', 'Quiz Night'). Extract those into 'exclusionsToAdd'.

          CRITICAL RULES:
          1. **EXPLICIT DATES OVERRIDE EVERYTHING:** If a specific date is written (e.g., "6th April"), you MUST extract that exact date. Do NOT shift explicit past dates into the future.
          2. **PRESERVE THE WHOLE WEEK:** Extract ALL days of that schedule, including days that have already happened. 
          3. **RELATIVE DAYS:** ONLY calculate the "next immediate date" for a day of the week if NO specific date number is provided.
          4. **DateStart Format:** "DD/MM/YYYY". 
          5. **VENUE NAME:** Extract ONLY the Business Name (e.g., 'The Plough'). DO NOT append the village.
          6. **VILLAGE:** Extract the town, village, or city name. If it truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.
          7. **NOTES:** Postcodes, addresses, or extra event details go into the "Notes" field.
          8. **DOUBLE DAYS:** If a single day lists multiple locations, create a completely separate JSON object for location.
          9. **MISSING TIMES:** If no time is explicitly stated for a venue, output "" (an empty string) for TimeStart and TimeEnd.
          10. **PRIVATE EVENTS:** If an event is explicitly marked as "private", "private party", completely ignore it. Do NOT extract it.
          11. **FACEBOOK 'TONIGHT' RULE (STRICT):** NEVER extract an event based solely on relative words like "tonight", "today", "tomorrow". Ignore these words entirely.
          12. **PROXIMITY REQUIREMENT:** You must ONLY extract an event if an explicit Day or Date is explicitly stated in the exact same sentence or list block as the venue name.
          
          JSON FORMAT ONLY:
          {
            "events": [{ "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM", "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town Name", "Notes": "..." }],
            "exclusionsToAdd": ["Name of non-truck"]
          }
          
          WEBSITE TEXT:
          ${cleanText.slice(0, 150000)} 
        `;
}

/**
 * Pass B (HatchGrab-linked trucks). `addressFormat` is the truck's country_settings.address_format and
 * `dateOrder` its date_order; 'postcode' (the UK) is the prompt exactly as it always was.
 */
function buildHgPrompt({ todayStr, currentYear, pageText, addressFormat = 'postcode', dateOrder = 'dmy' }) {
  if (addressFormat === 'zip_state') {
    const mdyLine = dateOrder === 'mdy' ? '\nDates written with numbers only are MONTH first: "10/12" is 12 October, so output "12/10".' : '';
    return `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.
You are extracting a food truck's schedule from website text. Extract events from TODAY ONWARDS — you MUST
INCLUDE today's event (a truck trading today is the most important to capture). Exclude ONLY events dated
BEFORE today.
DATE RULES: Format "DD/MM/YYYY". Always append /${currentYear}. Map day names to exact dates based on today.${mdyLine}
TIME RULES: "HH:MM" 24-hour. "5pm" → "17:00". If unknown, use "".
VENUE RULES: "venue_name" = ONLY the venue name. "town" = the city or town it is in. "state" = its two-letter state (e.g. "TX").
TOWN RULES (IMPORTANT): ALWAYS populate "town". If the city or town is EMBEDDED inside the venue name, SPLIT it out —
put the place-name in "town", the state in "state", and keep "venue_name" as just the venue name. If the town truly
cannot be determined, use "".
EXAMPLES (embedded-town split):
  "Joe's Tavern Austin TX"        -> {"venue_name":"Joe's Tavern","town":"Austin","state":"TX"}
  "Sunset Brewery, Boulder, CO"    -> {"venue_name":"Sunset Brewery","town":"Boulder","state":"CO"}
Return ONLY valid JSON:
{"events":[{"event_date":"DD/MM/YYYY","start_time":"HH:MM","end_time":"HH:MM","venue_name":"Name","town":"City","state":"ST","postcode":"ZIP code or empty"}]}

WEBSITE TEXT:
${pageText.slice(0, 100000)}`;
  }
  return `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.
You are extracting a food truck's schedule from website text. Extract events from TODAY ONWARDS — you MUST
INCLUDE today's event (a truck trading today is the most important to capture). Exclude ONLY events dated
BEFORE today.
DATE RULES: Format "DD/MM/YYYY". Always append /${currentYear}. Map day names to exact dates based on today.
TIME RULES: "HH:MM" 24-hour. "5pm" → "17:00". If unknown, use "".
VENUE RULES: "venue_name" = ONLY the pub/venue name. "town" = the village/town/city it is in.
TOWN RULES (IMPORTANT): ALWAYS populate "town". If the town/village is EMBEDDED inside the venue name,
SPLIT it out — put the place-name in "town" and keep "venue_name" as just the pub/venue name. A UK
place-name sitting next to a generic pub name (Bells/Star/Bell/Lion/Swan/Arms/Crown/Anchor, etc.) is the
town, not part of the venue name. Never leave a town buried in venue_name. If the town truly cannot be
determined, use "".
EXAMPLES (embedded-town split):
  "The Cavendish Five Bells"      -> {"venue_name":"Five Bells","town":"Cavendish"}
  "The Star Pub, Lidgate"         -> {"venue_name":"The Star","town":"Lidgate"}
  "Nethergate Brewery, Long Melford" -> {"venue_name":"Nethergate Brewery","town":"Long Melford"}
Return ONLY valid JSON:
{"events":[{"event_date":"DD/MM/YYYY","start_time":"HH:MM","end_time":"HH:MM","venue_name":"Name","town":"Town","postcode":"Postcode or empty"}]}

WEBSITE TEXT:
${pageText.slice(0, 100000)}`;
}

export { buildPassARulePrompt, buildPassAEventPrompt, buildHgPrompt };
