import { getLocalDateInTz, addDaysYmd, formatYmd, clockMins, type TimeSettings } from '@/lib/time-utils'
import { outputLanguageName } from '@/lib/ai-language'
import { addressFormatOrDefault, addressFormatOf, fillAiText } from '@/lib/address-formats'
import { normaliseRegion } from '@/lib/event-address'
export type ExtractedEvent = {
  event_date: string
  start_time: string
  end_time: string
  venue_name: string
  town: string
  postcode: string
  address?: string
  /** The region's code in the truck's format's list ("TX", "NSW", "KY") — Phase 2D-2, address-formats-2. Present only
   *  when the model gave one that is in the list. */
  state?: string
  /** A dependent locality (NZ "Ponsonby"), for a format with a suburb field. Present only when the model gave one. */
  suburb?: string
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
  /** ireland-1 (20 October 2026): the truck's country (ISO). Context only — address-formats-2 took the location lines off
   *  it: they come from `addressFormat`. */
  countryCode?: string | null
  /** country_settings.address_format — a format key (or a legacy value) of lib/address-formats.ts. The prompt's location
   *  lines and the parsed state follow it; absent → GB's. */
  addressFormat?: string | null
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

/** ireland-1 (20 October 2026): the prompt's OUTPUT LANGUAGE line — the truck's locale's language. Names and places are
 *  copied exactly as the source writes them (a venue is never translated); anything else the model writes is in it. */
export function outputLanguageBlock(locale: string | null | undefined): string {
  return `\n\nOUTPUT LANGUAGE: copy venue names, towns and addresses exactly as the source writes them — never translate them. Write anything else in ${outputLanguageName(locale)}.`
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
  // scripts/schedules-country-parity.cjs). ireland-1 (20 October 2026): EVERY PROMPT NAMES ITS OUTPUT LANGUAGE
  // (.cursor/rules/language.mdc rule 10) — the truck's locale's language. Names and places are copied as written.
  const contextBlock = truckContextBlock(ctx) + outputLanguageBlock(ts.locale)
  // 🔴 address-formats-2 (21 October 2026): THE LOCATION RULES COME FROM THE TRUCK'S ADDRESS FORMAT (lib/address-formats.ts
  // `ai.importer`) — no country-code branch. GB's and US's are the lines this prompt had, verbatim, so a UK and a US
  // prompt are byte for byte what they were (scripts/address-formats-2.cjs). No format → GB, as before.
  // The DATE lines follow the truck's date order: a month-first country is told how a numbers-only date reads. Output
  // stays DD/MM/YYYY in every country — the importer's data contract (parseDDMMYYYY).
  const ai = addressFormatOrDefault(ctx?.addressFormat).ai.importer
  const fill = (text: string) => fillAiText(text, { country: ctx?.countryName || 'this country', year: currentYear })
  const dateFormatLines = ts.dateOrder === 'mdy'
    ? `- Date format MUST be "DD/MM/YYYY" (day first) in your output
- Dates written with numbers only in the text are MONTH first: "10/12" is 12 October, so output "12/10/${currentYear}"`
    : `- Date format MUST be "DD/MM/YYYY"`

  return `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.${contextBlock}

You are extracting a food truck's schedule from messy, unstructured text or an image. Your job has two steps:
1. EXTRACT what you can see
2. ENRICH missing fields using your knowledge of ${fill(ai.knowledge)}

14-DAY DATE REFERENCE — use this exact table when converting day names to dates. Do not calculate independently:
${dateRef}

STEP 1 — EXTRACTION RULES:

DATE RULES:
${dateFormatLines}
- Always append /${currentYear} to dates without a year
- If December and event is in January, use ${nextYear}
- For day names (Monday, Tuesday etc), look them up in the 14-DAY DATE REFERENCE above — do not calculate

TIME RULES:
- Times MUST be "HH:MM" in 24-hour format
- "5pm" → "17:00", "5:30pm" → "17:30"
- If only start time given (e.g. "from 5pm"), set start_time to that value, leave end_time as ""
- Never use "00:00" — use "" if unknown

VENUE NAME RULES:
${fill(ai.venueRules)}
- If a venue name is one of: Closed, N/A, TBC, Unavailable, Cancelled — omit that event entirely from the output

${fill(ai.postalRules)}

${fill(ai.addressRules)}

STEP 2 — ENRICHMENT RULES:
After extracting what you can see, fill in any missing fields using your knowledge:
${fill(ai.enrichRules)}

EXAMPLES:

${fill(ai.examples)}

Return ONLY a valid JSON array, no markdown, no backticks, no explanation:
[{"event_date":"DD/MM/YYYY","start_time":"HH:MM","end_time":"HH:MM","venue_name":"Name",${ai.outputShape},"address":"street address only or empty string"}]${inputText ? `\n\nSCHEDULE TEXT TO EXTRACT:\n${inputText}` : ''}`
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
      // address-formats-2: the state checked against the truck's format's list ("nsw" → "NSW"); with no format, the old
      // rule (two letters, upper-cased). A suburb only for a format that has the field.
      ...(() => { const st = normaliseRegion(String(ev.state ?? '').trim(), options.context?.addressFormat ?? undefined); return st ? { state: st } : {} })(),
      ...(typeof ev.suburb === 'string' && ev.suburb.trim() && addressFormatOf(options.context?.addressFormat)?.fields.some(f => f.key === 'suburb') ? { suburb: ev.suburb.trim() } : {}),
      start_time: ev.start_time ?? '',
      end_time: (() => {
        const end = ev.end_time ?? ''
        const start = ev.start_time ?? ''
        // 🔴 17 October 2026: an end EARLIER than the start is an event that runs past midnight (lib/event-window.ts),
        // kept — the review shows "Ends the next day" under it. Only an end EQUAL to the start is blanked (the review
        // asks for one). Times that do not read as clock times keep the old string test.
        const s = clockMins(start), e = clockMins(end)
        if (end && start && (s != null && e != null ? e === s : end <= start)) return ''
        return end
      })(),
    }))
}
