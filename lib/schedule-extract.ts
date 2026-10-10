import { getLocalDateInTz, addDaysYmd, formatYmd, type TimeSettings } from '@/lib/time-utils'
export type ExtractedEvent = {
  event_date: string
  start_time: string
  end_time: string
  venue_name: string
  town: string
  postcode: string
  address?: string
  /** Two-letter state, for a zip_state country (Phase 2D-2). Present only when the model gave one. */
  state?: string
}

/**
 * 🔴 PHASE 2D-2 — WHAT THE IMPORTER IS TOLD ABOUT THE TRUCK, so the model places "The Fox" in the truck's own
 * area and country rather than the first Fox it knows. Built by lib/schedule-context.ts from the truck row,
 * its country's settings and its recent confirmed events (the Apps Script vendor-email prompt's pattern of
 * injecting prior events). Every field is optional; an absent one is a line left out, never a guess.
 */
export type ScheduleContext = {
  truckName?: string | null
  baseTown?: string | null
  baseRegion?: string | null
  countryName?: string | null
  /** country_settings.address_format — 'postcode' keeps today's UK location lines byte for byte. */
  addressFormat?: 'postcode' | 'zip_state'
  /** The distinct towns of its last 15 confirmed events, most recent first. */
  recentTowns?: string[]
}

/** The truck-context block — '' when there is no context at all. */
export function truckContextBlock(ctx?: ScheduleContext): string {
  if (!ctx) return ''
  const lines: string[] = []
  if (ctx.truckName) lines.push(`- Truck: ${ctx.truckName}`)
  const base = [ctx.baseTown, ctx.baseRegion].filter(Boolean).join(', ')
  if (base) lines.push(`- Based in: ${base}`)
  if (ctx.countryName) lines.push(`- Country: ${ctx.countryName}`)
  if (ctx.recentTowns?.length) lines.push(`- Towns of its recent confirmed events: ${ctx.recentTowns.join(', ')}`)
  if (!lines.length) return ''
  return `\n\nTRUCK CONTEXT — this truck's own area. Use it to place venues and towns; a venue name that exists in several places is most likely the one near these:\n${lines.join('\n')}`
}

export const INVALID_VENUES = ['Closed', 'N/A', 'TBC', 'Unavailable', 'Cancelled']

export function normaliseExclusionTerm(term: string): string {
  return term.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
}

export function isExcluded(venueName: string, exclusionTerms: string[]): boolean {
  const normVenue = normaliseExclusionTerm(venueName)
  return exclusionTerms.some(term => {
    const normTerm = normaliseExclusionTerm(term)
    return normTerm.length > 0 && normVenue.includes(normTerm)
  })
}

export function buildScheduleExtractionPrompt(inputText: string, ts: TimeSettings, ctx?: ScheduleContext): string {
  // 🔴 THE TRUCK'S TODAY, IN ITS COUNTRY'S WORDS (Phase 2B) — was the server's clock (UTC on Vercel), so
  // from 00:00 to 01:00 BST the AI was told today was yesterday.
  // ⚠️ THE NUMERIC DATES BELOW STAY DD/MM/YYYY IN EVERY COUNTRY: they are the OUTPUT FORMAT this prompt asks
  // the model for and the importer parses (parseDDMMYYYY), not a display — a data contract, not a style.
  const todayYmd = getLocalDateInTz(ts.timeZone)
  const todayStr = formatYmd(todayYmd, ts, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const currentYear = Number(todayYmd.slice(0, 4))
  const nextYear = currentYear + 1
  const ddmmyyyy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

  const dateRef = Array.from({ length: 14 }, (_, i) => {
    const ymd = addDaysYmd(todayYmd, i)
    const dayName = formatYmd(ymd, ts, { weekday: 'long' })
    return `${dayName} = ${ddmmyyyy(ymd)}`
  }).join('\n')

  // 🔴 PHASE 2D-2. The truck-context block is the ONE addition a UK truck sees (named in
  // scripts/schedules-country-parity.cjs); every UK location line below is byte for byte what it was. A
  // zip_state country (the US) gets its own location lines — city, two-letter state, ZIP — in zipStatePrompt.
  const contextBlock = truckContextBlock(ctx)
  if (ctx?.addressFormat === 'zip_state') return zipStatePrompt(inputText, todayStr, currentYear, nextYear, dateRef, contextBlock, ctx.countryName || 'the United States')

  return `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.${contextBlock}

You are extracting a food truck's schedule from messy, unstructured text or an image. Your job has two steps:
1. EXTRACT what you can see
2. ENRICH missing fields using your knowledge of UK venues and locations

14-DAY DATE REFERENCE — use this exact table when converting day names to dates. Do not calculate independently:
${dateRef}

STEP 1 — EXTRACTION RULES:

DATE RULES:
- Date format MUST be "DD/MM/YYYY"
- Always append /${currentYear} to dates without a year
- If December and event is in January, use ${nextYear}
- For day names (Monday, Tuesday etc), look them up in the 14-DAY DATE REFERENCE above — do not calculate

TIME RULES:
- Times MUST be "HH:MM" in 24-hour format
- "5pm" → "17:00", "5:30pm" → "17:30"
- If only start time given (e.g. "from 5pm"), set start_time to that value, leave end_time as ""
- Never use "00:00" — use "" if unknown

VENUE NAME RULES:
- Extract ONLY the pub/venue name — never include village, town, or postcode in venue_name
- "The Fox Burwell" → venue_name="The Fox", town="Burwell"
- "The Red Lion Belchamp Otten CO10 7BQ" → venue_name="The Red Lion", town="Belchamp Otten", postcode="CO10 7BQ"
- "Five Bells, Burwell, CB25 0EJ, 5pm-9pm" → venue_name="The Five Bells", town="Burwell", postcode="CB25 0EJ"
- If a venue name is one of: Closed, N/A, TBC, Unavailable, Cancelled — omit that event entirely from the output

POSTCODE RULES:
- UK postcodes follow the format: letters+numbers SPACE number+letters (e.g. "CB25 0BA", "CO10 7BQ", "PE28 2SB")
- Always extract the FULL postcode as one unit — if "CB25" is on one line and "0BA" on the next, postcode="CB25 0BA"
- A postcode fragment alone (like "0BA" or "OBA") is never a town — combine it with the preceding partial postcode
- If you see a full valid UK postcode anywhere in the text for that event, extract it
- Return postcodes in uppercase

ADDRESS RULES:
- address is for street-level detail only — house number + street name (e.g. "12 High Street")
- NEVER populate address with the town name, village name, or postcode — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases

STEP 2 — ENRICHMENT RULES:
After extracting what you can see, fill in any missing fields using your knowledge:
- If you have a venue name and town but no postcode → look up the UK postcode for that venue and provide it
- If you have a venue name but no town → determine the town/village from your knowledge of that UK venue
- If the venue name is ambiguous (e.g. "The Fox") and you have a postcode or town → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""

EXAMPLES:

Input: "Wednesday 3/6 The Red Lion Belchamp Otten CO10 7BQ"
Output: {"event_date":"03/06/${currentYear}","start_time":"","end_time":"","venue_name":"The Red Lion","town":"Belchamp Otten","postcode":"CO10 7BQ"}

Input: "Friday 5/6 The Fox Burwell CB25 0BA"
Output: {"event_date":"05/06/${currentYear}","start_time":"","end_time":"","venue_name":"The Fox","town":"Burwell","postcode":"CB25 0BA"}

Input: "Sunday 7/6 The Five Bells Burwell Birthday Party from 5pm"
Output: {"event_date":"07/06/${currentYear}","start_time":"17:00","end_time":"","venue_name":"The Five Bells","town":"Burwell","postcode":"CB25 0EJ"}

Input: "Sat 14th June The Crown Wickhambrook 5pm-9pm"
Output: {"event_date":"14/06/${currentYear}","start_time":"17:00","end_time":"21:00","venue_name":"The Crown","town":"Wickhambrook","postcode":"CB8 8PD"}

Return ONLY a valid JSON array, no markdown, no backticks, no explanation:
[{"event_date":"DD/MM/YYYY","start_time":"HH:MM","end_time":"HH:MM","venue_name":"Name","town":"Town","postcode":"POSTCODE","address":"street address only or empty string"}]${inputText ? `\n\nSCHEDULE TEXT TO EXTRACT:\n${inputText}` : ''}`
}

/** The importer prompt for a zip_state country (city · two-letter state · ZIP). Output stays DD/MM/YYYY — the
 *  importer's data contract — and a numbers-only date in the text is read MONTH first. */
function zipStatePrompt(inputText: string, todayStr: string, currentYear: number, nextYear: number, dateRef: string, contextBlock: string, countryName: string): string {
  return `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.${contextBlock}

You are extracting a food truck's schedule from messy, unstructured text or an image. Your job has two steps:
1. EXTRACT what you can see
2. ENRICH missing fields using your knowledge of venues and locations in ${countryName}

14-DAY DATE REFERENCE — use this exact table when converting day names to dates. Do not calculate independently:
${dateRef}

STEP 1 — EXTRACTION RULES:

DATE RULES:
- Date format MUST be "DD/MM/YYYY" (day first) in your output
- Dates written with numbers only in the text are MONTH first: "10/12" is 12 October, so output "12/10/${currentYear}"
- Always append /${currentYear} to dates without a year
- If December and event is in January, use ${nextYear}
- For day names (Monday, Tuesday etc), look them up in the 14-DAY DATE REFERENCE above — do not calculate

TIME RULES:
- Times MUST be "HH:MM" in 24-hour format
- "5pm" → "17:00", "5:30pm" → "17:30"
- If only start time given (e.g. "from 5pm"), set start_time to that value, leave end_time as ""
- Never use "00:00" — use "" if unknown

VENUE NAME RULES:
- Extract ONLY the venue name — never include the city, state or ZIP code in venue_name
- "Joe's Tavern Austin TX 78701" → venue_name="Joe's Tavern", town="Austin", state="TX", postcode="78701"
- "Sunset Brewery, Boulder, CO" → venue_name="Sunset Brewery", town="Boulder", state="CO"
- If a venue name is one of: Closed, N/A, TBC, Unavailable, Cancelled — omit that event entirely from the output

ZIP CODE AND STATE RULES:
- "town" is the city or town; "state" is the two-letter state code (e.g. "TX", "CA")
- ZIP codes are five digits (e.g. "78701"); put the ZIP code in "postcode"
- If you see a ZIP code anywhere in the text for that event, extract it

ADDRESS RULES:
- address is for street-level detail only — house number + street name (e.g. "1200 Main Street")
- NEVER populate address with the city, state or ZIP code — leave it blank if no street address is available
- Most schedules will not have a street address — leave address as "" in those cases

STEP 2 — ENRICHMENT RULES:
After extracting what you can see, fill in any missing fields using your knowledge:
- If you have a venue name and town but no state → determine the state from your knowledge of that venue
- If you have a venue name but no town → determine the city or town from your knowledge of that venue in ${countryName}
- If the venue name is ambiguous and you have a town or ZIP code → use that to identify the correct venue
- Only enrich with high confidence — if uncertain, leave the field as ""

EXAMPLES:

Input: "Sat June 14 Joe's Tavern Austin TX 5pm-9pm"
Output: {"event_date":"14/06/${currentYear}","start_time":"17:00","end_time":"21:00","venue_name":"Joe's Tavern","town":"Austin","state":"TX","postcode":""}

Input: "6/7 Sunset Brewery, Boulder CO 80302 from 4pm"
Output: {"event_date":"07/06/${currentYear}","start_time":"16:00","end_time":"","venue_name":"Sunset Brewery","town":"Boulder","state":"CO","postcode":"80302"}

Return ONLY a valid JSON array, no markdown, no backticks, no explanation:
[{"event_date":"DD/MM/YYYY","start_time":"HH:MM","end_time":"HH:MM","venue_name":"Name","town":"City","state":"ST","postcode":"ZIP","address":"street address only or empty string"}]${inputText ? `\n\nSCHEDULE TEXT TO EXTRACT:\n${inputText}` : ''}`
}

async function callGeminiWithRetry(
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[],
  model: string,
  maxAttempts = 3
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] }),
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Gemini HTTP ${res.status}: ${errText}`)
      }

      const data = await res.json()
      const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      if (!raw) throw new Error('Gemini returned empty response')

      return raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        console.warn(`[schedule-extract] Gemini attempt ${attempt} failed, retrying in 2s:`, err)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  throw new Error(`[schedule-extract] Gemini failed after ${maxAttempts} attempts: ${lastError}`)
}

export async function extractScheduleEvents(
  content: string | { mimeType: string; base64: string },
  /** The truck's time settings (lib/truck-time.ts) — its "today" for the prompt's date table. */
  time: TimeSettings,
  options: { model?: string; context?: ScheduleContext } = {}
): Promise<ExtractedEvent[]> {
  const model = options.model ?? 'gemini-2.5-flash'

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] =
    typeof content === 'string'
      ? [{ text: buildScheduleExtractionPrompt(content, time, options.context) }]
      : [
          { inlineData: { mimeType: content.mimeType, data: content.base64 } },
          { text: buildScheduleExtractionPrompt('', time, options.context) },
        ]

  let raw: string
  try {
    raw = await callGeminiWithRetry(parts, model)
  } catch (err) {
    console.error('[schedule-extract] Gemini call failed:', err)
    return []
  }

  let parsed: any[]
  try {
    const result = JSON.parse(raw)
    // Handle both array response and { events: [] } object response
    parsed = Array.isArray(result) ? result : (result.events ?? [])
  } catch (err) {
    console.error('[schedule-extract] JSON parse failed. Raw response:', raw)
    return []
  }

  return parsed
    .filter((ev: any) =>
      ev.venue_name &&
      !INVALID_VENUES.some(v => ev.venue_name.trim().toLowerCase() === v.toLowerCase())
    )
    .map((ev: any): ExtractedEvent => ({
      event_date: ev.event_date ?? '',
      venue_name: ev.venue_name ?? '',
      town: ev.town ?? '',
      postcode: (ev.postcode ?? '').toUpperCase().trim(),
      address: ev.address ?? '',
      ...(/^[A-Za-z]{2}$/.test(String(ev.state ?? '').trim()) ? { state: String(ev.state).trim().toUpperCase() } : {}),
      start_time: ev.start_time ?? '',
      end_time: (() => {
        const end = ev.end_time ?? ''
        const start = ev.start_time ?? ''
        if (end && start && end <= start) return ''
        return end
      })(),
    }))
}
