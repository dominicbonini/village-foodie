export type ExtractedEvent = {
  event_date: string
  start_time: string
  end_time: string
  venue_name: string
  town: string
  postcode: string
  address?: string
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

export function buildScheduleExtractionPrompt(inputText: string): string {
  const today = new Date()
  const todayStr = today.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const currentYear = today.getFullYear()
  const nextYear = currentYear + 1

  const dateRef = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const dayName = d.toLocaleDateString('en-GB', { weekday: 'long' })
    const dateStr = d.toLocaleDateString('en-GB')
    return `${dayName} = ${dateStr}`
  }).join('\n')

  return `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.

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
  options: { model?: string } = {}
): Promise<ExtractedEvent[]> {
  const model = options.model ?? 'gemini-2.5-flash'

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] =
    typeof content === 'string'
      ? [{ text: buildScheduleExtractionPrompt(content) }]
      : [
          { inlineData: { mimeType: content.mimeType, data: content.base64 } },
          { text: buildScheduleExtractionPrompt('') },
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
      start_time: ev.start_time ?? '',
      end_time: (() => {
        const end = ev.end_time ?? ''
        const start = ev.start_time ?? ''
        if (end && start && end <= start) return ''
        return end
      })(),
    }))
}
