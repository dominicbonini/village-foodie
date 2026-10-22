// scripts/scraper-prompts.js — the scraper's three schedule prompts, as functions (Phase 2D-2 Part A,
// docs/schedules-country-report.md). Moved out of scripts/run-scraper.js UNCHANGED, so a harness can build them
// and compare them byte for byte with what the scraper sent before (scripts/schedules-country-parity.cjs).
//
// 🔴 EACH TAKES THE SOURCE'S COUNTRY. Pass A's two prompts carry no UK-only line, so their text is the same in every
// country. Pass B's prompt (buildHgPrompt) takes its location lines from the truck's ADDRESS FORMAT
// (lib/address-formats.ts `ai.scraper`: the VENUE RULES line, the TOWN RULES block, the examples and the output's
// location keys), and an mdy country gets one line on month-first dates.
// address-formats-2 follow-up (22 October 2026, docs/address-formats-2-report.md): it branched on `zip_state` here, so
// once address-formats-1's SQL stored the US as `us`, US trucks got the UK lines. No format value is named in this file
// now; GB's and US's lines moved to the config verbatim (scripts/scraper-prompts-format.cjs proves both prompts).
// 🔴 Node imports the config's TypeScript directly (type stripping: on by default from Node 22.18; the scrape workflows
// run Node 24), so there is no second copy of any rule here.
import { addressFormatOrDefault, DEFAULT_ADDRESS_FORMAT } from '../lib/address-formats.ts';

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
 * Pass B (HatchGrab-linked trucks). `addressFormat` is the truck's country_settings.address_format (a format key, or a
 * legacy value the config still maps; anything else is GB, as before) and `dateOrder` its date_order.
 */
function buildHgPrompt({ todayStr, currentYear, pageText, addressFormat = DEFAULT_ADDRESS_FORMAT, dateOrder = 'dmy' }) {
  const rules = addressFormatOrDefault(addressFormat).ai.scraper;
  const mdyLine = dateOrder === 'mdy' ? '\nDates written with numbers only are MONTH first: "10/12" is 12 October, so output "12/10".' : '';
  return `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.
You are extracting a food truck's schedule from website text. Extract events from TODAY ONWARDS — you MUST
INCLUDE today's event (a truck trading today is the most important to capture). Exclude ONLY events dated
BEFORE today.
DATE RULES: Format "DD/MM/YYYY". Always append /${currentYear}. Map day names to exact dates based on today.${mdyLine}
TIME RULES: "HH:MM" 24-hour. "5pm" → "17:00". If unknown, use "".
${rules.venueRules}
${rules.townRules}
EXAMPLES (embedded-town split):
${rules.examples}
Return ONLY valid JSON:
{"events":[{"event_date":"DD/MM/YYYY","start_time":"HH:MM","end_time":"HH:MM","venue_name":"Name",${rules.outputShape}}]}

WEBSITE TEXT:
${pageText.slice(0, 100000)}`;
}

export { buildPassARulePrompt, buildPassAEventPrompt, buildHgPrompt };
