import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const token = formData.get('token') as string
  const file = formData.get('file') as File | null
  const text = formData.get('text') as string | null

  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: truck } = await supabase
    .from('trucks')
    .select('id, name')
    .eq('dashboard_token', token)
    .single()

  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const prompt = `You are extracting allergen information from a food truck allergen card.

Extract and structure all allergen information clearly.

Return ONLY valid JSON, no markdown:
{
  "summary": "Brief one-line summary e.g. 'Our kitchen handles nuts, dairy and gluten'",
  "contains": ["Dairy", "Gluten", "Eggs"],
  "may_contain": ["Nuts", "Soy"],
  "free_from": ["Shellfish", "Fish"],
  "dietary_options": ["Vegetarian options available", "Vegan options available"],
  "additional_notes": "Any other relevant allergen information",
  "formatted_text": "The full allergen information formatted as clear readable text for customers"
}

Standard allergens to look for:
Celery, Gluten, Crustaceans, Eggs, Fish, Lupin, Milk/Dairy, Molluscs,
Mustard, Nuts, Peanuts, Sesame, Soy, Sulphur Dioxide

If information is unclear or not present for a field, use an empty array or null.`

  let geminiBody: object

  if (file) {
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    geminiBody = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }
  } else {
    geminiBody = {
      contents: [{ parts: [{ text: `${prompt}\n\nAllergen information:\n${text}` }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }
  }

  let lastError: Error | null = null
  let responseText: string | null = null

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) }
      )
      const data = await res.json()
      if (data.error?.code === 429 || data.error?.code === 503) {
        await new Promise(r => setTimeout(r, attempt * 2000))
        lastError = new Error(data.error.message)
        continue
      }
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (responseText) break
      lastError = new Error('Empty response')
    } catch (err) {
      lastError = err as Error
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000))
    }
  }

  if (!responseText) {
    console.error('[process-allergens] All retries failed:', lastError)
    return NextResponse.json({ error: 'AI processing failed — please try again' }, { status: 500 })
  }

  try {
    const parsed = JSON.parse(responseText)
    return NextResponse.json({ ok: true, allergens: parsed })
  } catch {
    return NextResponse.json({ error: 'Failed to parse allergen data' }, { status: 500 })
  }
}
