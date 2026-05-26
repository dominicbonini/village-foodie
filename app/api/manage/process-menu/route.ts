import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STANDARD_CATEGORIES = [
  'Starters', 'Mains', 'Burgers', 'Pizza', 'Wraps & Sandwiches',
  'Sides', 'Dips & Sauces', 'Desserts', 'Drinks', 'Kids Menu',
  'Specials', 'Other',
]

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const token = formData.get('token') as string
  const text = formData.get('text') as string | null
  const file = formData.get('file') as File | null

  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: truck } = await supabase
    .from('trucks')
    .select('id, name')
    .eq('dashboard_token', token)
    .single()

  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: existingCats } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('truck_id', truck.id)
    .eq('is_active', true)

  const existingCatNames = (existingCats || []).map(c => c.name)
  const allCategoryOptions = [
    ...existingCatNames,
    ...STANDARD_CATEGORIES.filter(c => !existingCatNames.includes(c)),
  ]

  const prompt = `You are a menu digitisation assistant for a food truck called "${truck.name}".

Extract all menu items from the content provided.

Available categories (use these exactly, pick the best fit):
${allCategoryOptions.map(c => `- ${c}`).join('\n')}

Rules:
- Use existing category names when they match
- Each item needs: name, price (number, no currency symbol), category
- description: the dish description ONLY — do NOT include allergen labels, dietary info, or "Contains/May contain" text in the description
- allergens: extract any allergen or dietary labels as a separate array (e.g. ["Dairy", "Gluten", "Nuts", "Vegetarian", "Vegan"])
  Common labels to look for: Dairy, Lactose, Gluten, Nuts, Eggs, Soy, Fish, Shellfish, Celery, Mustard, Vegetarian, Vegan, Halal, Kosher
  Normalise them — "Includes Dairy" and "Contains Dairy" both become "Dairy"
  "May Contains Nuts" becomes "Nuts" with a note it may contain
- dietary: extract dietary preference labels as a separate array (e.g. ["Vegetarian", "Vegan", "Halal", "Kosher"])
- If price is unclear or missing, use 0
- Group items logically — don't create more than 8 categories
- Return ONLY valid JSON, no markdown

Response format:
{
  "categories": ["Mains", "Sides", "Drinks"],
  "items": [
    {
      "name": "Tiramisu",
      "description": "Layers of delicate ladyfingers soaked in espresso and marsala wine, mascarpone, cream and a dusting of cocoa.",
      "price": 6.50,
      "category": "Desserts",
      "allergens": ["Dairy", "Lactose", "Gluten", "Nuts"],
      "dietary": ["Vegetarian"]
    }
  ]
}`

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
      contents: [{ parts: [{ text: `${prompt}\n\nMenu content:\n${text}` }] }],
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
        const waitMs = attempt * 2000
        await new Promise(r => setTimeout(r, waitMs))
        lastError = new Error(data.error.message)
        continue
      }

      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (responseText) break

      lastError = new Error('Empty response from AI')
    } catch (err) {
      lastError = err as Error
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 1000))
      }
    }
  }

  if (!responseText) {
    console.error('[process-menu] All retries failed:', lastError)
    return NextResponse.json({ error: 'AI processing failed — please try again' }, { status: 500 })
  }

  try {
    const parsed = JSON.parse(responseText)

    const items = (parsed.items || []).map((item: any) => ({
      ...item,
      price: typeof item.price === 'number' ? item.price : 0,
      price_missing: !item.price || item.price === 0,
      allergens: item.allergens || [],
      dietary: item.dietary || [],
    }))

    return NextResponse.json({
      categories: parsed.categories || [],
      items,
      existing_categories: existingCatNames,
    })
  } catch (err) {
    console.error('[process-menu] JSON parse error:', err)
    return NextResponse.json({ error: 'Failed to process menu' }, { status: 500 })
  }
}
