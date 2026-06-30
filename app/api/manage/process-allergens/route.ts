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
  // mode='transcribe' → CARD-ONLY display path: faithfully transcribe the card's allergen/dietary text as
  // PROSE for the operator to review, with NO 14-UK-vocab mapping and NO restructuring. Any other value
  // (incl. absent) = the default extract-to-structured path used by the per-dish flow (UNCHANGED).
  const transcribeOnly = (formData.get('mode') as string | null) === 'transcribe'

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
  "formatted_text": "The full allergen information formatted as clear readable text for customers",
  "entries": [
    { "name": "Pad Thai", "allergens": ["Peanuts", "Gluten", "Crustaceans"], "confidence": "high" }
  ],
  "blanket": ["Tree nuts"],
  "cross_contamination": ["Fryer shared with gluten-containing items"]
}

Standard allergens to look for (the 14 UK statutory allergens — use these EXACT names):
Gluten, Crustaceans, Eggs, Fish, Peanuts, Soy, Dairy, Tree nuts,
Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs

PER-DISH "entries" — extract a list of { name, allergens[], confidence } ONLY when the card links allergens
to SPECIFIC named dishes/items. Cover these card formats:
- MATRIX (dishes in rows, allergens in columns, ticks/✓/X) → one entry per dish, allergens = the ticked columns.
- FOOTNOTE CODES ("Pad Thai 1,3,7" with a legend "1=Gluten, 3=Eggs, 7=Peanuts") → RESOLVE each code to its
  allergen NAME via the legend before emitting. If the legend is MISSING or only partial, still emit the dish
  but set "confidence":"low" (so the operator double-checks) — never emit an unresolved numeric code.
- "name" = the dish name EXACTLY as printed on the card (so it can be matched to the menu). "confidence" =
  "high" for a clear matrix tick / fully-resolved codes; "low" when you had to guess or the legend was incomplete.

STATED-DATA-ONLY (safety-critical): extract an allergen for a dish ONLY from an explicit tick/code/label on
the card. NEVER infer an allergen from the dish NAME or what it "probably" contains. If a dish has no stated
allergen data, omit it from "entries".

NON-PER-DISH statements — do NOT force these into "entries":
- A blanket statement covering ALL food ("everything may contain nuts", "all items handled in a kitchen with
  gluten") → put the allergen name(s) in "blanket".
- A category/prose statement ("all curries contain peanuts") that names a CATEGORY not a specific dish → put
  the sentence in "cross_contamination" (the operator decides which dishes) — do NOT expand it to dishes.
- Cross-contamination / shared-equipment notes ("fryer shared with gluten") → "cross_contamination".

"free_from" is an ABSENCE claim — list it in free_from ONLY; NEVER convert a free-from into a dish allergen.

If information is unclear or not present for a field, use an empty array or null. Be precise — the 14 EXACT
names only; map "milk"→"Dairy". Leave generic "Nuts"/"Shellfish" as written (the operator refines them).`

  // Card-only TRANSCRIBE prompt — faithful prose, NO vocab mapping, NO restructuring (Interpretation A).
  const transcribePrompt = `You are transcribing the allergen and dietary information from a food truck's allergen card so the operator can review it.

Read ONLY the allergen- and dietary-relevant text off the card and return it as plain prose, faithfully.

RULES:
- Preserve the operator's OWN wording and phrasing, including any per-dish or caveat statements (e.g. "all fish & chips contain wheat, milk", "fryer shared with nuts", "lactose").
- Keep every term EXACTLY as written. Do NOT map, rename, or normalise anything — e.g. do NOT change "lactose" to "Dairy", do NOT change "milk" to "Dairy". Do NOT map to any standard allergen list.
- Do NOT restructure into "Contains: X, Y" unless the card itself is written that way.
- IGNORE prices, decoration, logos, and any content that is not allergen/dietary information.
- Preserve line breaks and list structure where the card has them.
- Return ONLY the transcribed text — no preamble, no JSON, no markdown, no commentary.`

  const activePrompt = transcribeOnly ? transcribePrompt : prompt
  const responseMimeType = transcribeOnly ? 'text/plain' : 'application/json'

  let geminiBody: object

  if (file) {
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    geminiBody = {
      contents: [{ parts: [{ text: activePrompt }, { inlineData: { mimeType: file.type, data: base64 } }] }],
      generationConfig: { temperature: 0, responseMimeType },
    }
  } else {
    geminiBody = {
      contents: [{ parts: [{ text: `${activePrompt}\n\nAllergen information:\n${text}` }] }],
      generationConfig: { temperature: 0, responseMimeType },
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

  // Transcribe mode returns PROSE verbatim (no JSON parse) for the operator to review/edit.
  if (transcribeOnly) {
    return NextResponse.json({ ok: true, text: responseText.trim() })
  }

  try {
    const parsed = JSON.parse(responseText)
    return NextResponse.json({ ok: true, allergens: parsed })
  } catch {
    return NextResponse.json({ error: 'Failed to parse allergen data' }, { status: 500 })
  }
}
