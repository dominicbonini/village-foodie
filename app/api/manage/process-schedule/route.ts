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

  const prompt = `CRITICAL CONTEXT: Today is ${todayStr}.
Extract the food truck schedule from this content.
CRITICAL DATE RULES: The current year is ${currentYear}. Append /${currentYear} to all dates that don't have a year. If the current month is December and the event is in January, use ${nextYear}. If only days of the week are listed, map them to exact DD/MM/YYYY dates for the current week.
Date format MUST be "DD/MM/YYYY". Times MUST be "HH:MM". If no time is listed, use empty string "". Do NOT use "00:00".
Return ONLY valid JSON, no markdown, no backticks:
{ "events": [{ "event_date": "DD/MM/YYYY", "start_time": "HH:MM", "end_time": "HH:MM", "venue_name": "Name", "town": "Town", "postcode": "Postcode or empty string" }] }`

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
