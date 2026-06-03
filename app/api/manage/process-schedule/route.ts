import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const token = formData.get('token') as string | null
  const file = formData.get('file') as File | null
  const text = formData.get('text') as string | null

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  const { data: truck } = await supabase
    .from('trucks')
    .select('id')
    .eq('dashboard_token', token)
    .single()

  if (!truck) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const today = new Date()
  const todayStr = today.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const currentYear = today.getFullYear()
  const nextYear = currentYear + 1

  const prompt = `CRITICAL CONTEXT: Today is ${todayStr}. Current year is ${currentYear}.

You are extracting a food truck's schedule from messy, unstructured text or an image. Your job has two steps:
1. EXTRACT what you can see
2. ENRICH missing fields using your knowledge of UK venues and locations

STEP 1 — EXTRACTION RULES:

DATE RULES:
- Date format MUST be "DD/MM/YYYY"
- Always append /${currentYear} to dates without a year
- If December and event is in January, use ${nextYear}
- Map day names (Monday, Tuesday etc) to exact DD/MM/YYYY for the current week based on today (${todayStr})

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

POSTCODE RULES:
- UK postcodes follow the format: letters+numbers SPACE number+letters (e.g. "CB25 0BA", "CO10 7BQ", "PE28 2SB")
- Always extract the FULL postcode as one unit — if "CB25" is on one line and "0BA" on the next, postcode="CB25 0BA"
- A postcode fragment alone (like "0BA" or "OBA") is never a town — combine it with the preceding partial postcode
- If you see a full valid UK postcode anywhere in the text for that event, extract it

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

Input: "Tuesday - The Anchor, Tiptree CO5 0AZ, 5-8PM"
Output: {"event_date":"03/06/${currentYear}","start_time":"17:00","end_time":"20:00","venue_name":"The Anchor","town":"Tiptree","postcode":"CO5 0AZ"}

Return ONLY valid JSON, no markdown, no backticks, no explanation:
{"events":[{"event_date":"DD/MM/YYYY","start_time":"HH:MM","end_time":"HH:MM","venue_name":"Name","town":"Town","postcode":"Postcode or empty string"}]}`

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = []

  if (file && file.size > 0) {
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    parts.push({ inlineData: { mimeType: file.type, data: base64 } })
    parts.push({ text: text ? `${text}\n\n${prompt}` : prompt })
  } else {
    parts.push({ text: text ? `${text}\n\n${prompt}` : prompt })
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    )

    if (!geminiRes.ok) {
      console.error('[process-schedule] Gemini error:', await geminiRes.text())
      return NextResponse.json({ error: 'Failed to extract events' }, { status: 500 })
    }

    const geminiData = await geminiRes.json()
    let raw: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    const parsed = JSON.parse(raw)
    const events = (parsed.events || []).map((e: any) => ({
      event_date: e.event_date || '',
      start_time: e.start_time || '',
      end_time: e.end_time || '',
      venue_name: e.venue_name || '',
      town: e.town || '',
      postcode: e.postcode || '',
    }))

    return NextResponse.json({ events })
  } catch (err) {
    console.error('[process-schedule] error:', err)
    return NextResponse.json({ error: 'Failed to extract events' }, { status: 500 })
  }
}
