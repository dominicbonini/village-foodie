import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const text = formData.get('text') as string | null
  const file = formData.get('file') as File | null

  if (!text && !file) {
    return NextResponse.json({ error: 'No content provided' }, { status: 400 })
  }

  const today = new Date()
  const currentYear = today.getFullYear()

  const prompt = `Today is ${today.toDateString()}.
Extract all food truck schedule events from the content below.
Current year is ${currentYear} — use this if no year is specified.
If only days of the week are given, use the dates for the current or next week.

Return ONLY valid JSON, no markdown:
{
  "events": [
    {
      "venue_name": "The Crown",
      "town": "Wickhambrook",
      "postcode": "CB8 8PD",
      "event_date": "DD/MM/YYYY",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "notes": ""
    }
  ]
}

Rules:
- event_date must be DD/MM/YYYY format
- start_time and end_time must be HH:MM or empty string if not specified
- postcode: extract if visible, otherwise leave empty
- town: the village, town, or city name
- If no events found, return { "events": [] }`

  let geminiBody: object

  if (file) {
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    geminiBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: file.type, data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }
  } else {
    geminiBody = {
      contents: [{ parts: [{ text: prompt + '\n\nContent:\n' + text }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    }
  )

  const data = await res.json()
  const text_response = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text_response) {
    return NextResponse.json({ error: 'AI processing failed' }, { status: 500 })
  }

  try {
    const parsed = JSON.parse(text_response)
    return NextResponse.json({ events: parsed.events || [] })
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }
}
