// lib/menu-extract.ts
// The AI menu importer's CORE — extracted (V9.x) from app/api/manage/process-menu/route.ts, which is now a
// thin auth-and-shape wrapper around it.
//
// WHY: the demo provisioner runs server-side and needs to import a menu. The alternative was a self-fetch
// from one Next route to another, which this codebase has NO precedent for (every NEXT_PUBLIC_HATCHGRAB_URL
// use builds a link for an email, never an API call) and which would add absolute-URL resolution in
// serverless plus a second cold start on the demo's latency-critical path. Extraction is cheaper and
// honest: nothing here was ever HTTP-specific except reading the token and the form body.
//
// The PROMPT below is lifted BYTE-FOR-BYTE from the route. It is heavily tuned (variant collapsing, the
// anti-over-merge guard, allergens-are-stated-data-only). Do not tidy it — behaviour changes silently and
// only surfaces as a worse import weeks later.

import type { SupabaseClient } from '@supabase/supabase-js'

export const STANDARD_CATEGORIES = [
  'Starters', 'Mains', 'Burgers', 'Pizza', 'Wraps & Sandwiches',
  'Sides', 'Dips & Sauces', 'Desserts', 'Drinks', 'Kids Menu',
  'Specials', 'Other',
]


export interface ExtractedOption { name: string; price: number; allergens: string[]; dietary: string[] }

export interface ExtractedGroup {
  name: string
  options: ExtractedOption[]
  isRequired: boolean
  singleSelect: boolean
  _inferredFromVariants: boolean
}

export interface ExtractedItem {
  name: string
  description?: string | null
  price: number
  price_missing: boolean
  category: string
  allergens: string[]
  dietary: string[]
  spiciness: number | null
  modifierGroups?: ExtractedGroup[]
  [k: string]: unknown
}

export interface MenuExtraction {
  categories: string[]
  items: ExtractedItem[]
  existing_categories: string[]
}

/** Raised when the model could not be reached or returned something unparseable. */
export class MenuExtractionError extends Error {
  constructor(message: string) { super(message); this.name = 'MenuExtractionError' }
}

/**
 * Run the AI menu importer against a truck. Reads the truck's EXISTING menu for prompt context — a fresh
 * demo truck has none, so that block drops out automatically, which is exactly why the demo needs no
 * importer changes. Writes NOTHING: extraction only; commit is a separate, explicit step.
 */
export async function extractMenu(
  supabase: SupabaseClient,
  truck: { id: string; name: string },
  input: { file?: File | null; text?: string | null },
): Promise<MenuExtraction> {
  const file = input.file ?? null
  const text = input.text ?? null

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

  // EXISTING-MENU CONTEXT (Stage 1) — fetch the operator's current items + modifier groups so the
  // model groups variants the way THIS operator already structures their menu (reuse an existing
  // group name; respect dishes they already keep separate). Prompt context only — no ML/training.
  const catNameById: Record<string, string> = {}
  ;(existingCats || []).forEach(c => { catNameById[c.id] = c.name })

  const { data: existingItems } = await supabase
    .from('menu_items_db')
    .select('name, category_id')
    .eq('truck_id', truck.id)
    .eq('is_active', true)

  const { data: existingGroups } = await supabase
    .from('modifier_groups')
    .select('id, name, is_required, min_choices, max_choices')
    .eq('truck_id', truck.id)

  const { data: existingOptions } = await supabase
    .from('modifier_options')
    .select('name, group_id')
    .in('group_id', (existingGroups || []).map(g => g.id).length ? (existingGroups || []).map(g => g.id) : ['none'])

  // Compact, human-readable summaries for the prompt (kept small — names only).
  const existingItemsSummary = (existingItems || [])
    .map(i => `${i.name}${catNameById[i.category_id as string] ? ` (${catNameById[i.category_id as string]})` : ''}`)
    .join(', ')
  const existingGroupsSummary = (existingGroups || [])
    .map(g => {
      const opts = (existingOptions || []).filter(o => o.group_id === g.id).map(o => o.name)
      return `${g.name}: ${opts.join('/') || '(no options yet)'}`
    })
    .join('; ')

  const prompt = `You are a menu digitisation assistant for a food truck called "${truck.name}".

Extract all menu items from the content provided.

Available categories (use these exactly, pick the best fit):
${allCategoryOptions.map(c => `- ${c}`).join('\n')}

Rules:
- Use existing category names when they match
- Each item needs: name, price (number, no currency symbol), category
- description: the dish description ONLY — do NOT include allergen labels, dietary info, or "Contains/May contain" text in the description
- allergens: extract any STATED allergen labels as a separate array (e.g. ["Dairy", "Gluten", "Peanuts"])
  The 14 UK statutory allergens (use these EXACT names): Gluten, Crustaceans, Eggs, Fish, Peanuts, Soy, Dairy, Tree nuts, Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs
  (Also accept "Lactose" when the menu states it specifically.) Map common menu wording to these names:
  "milk" → Dairy; "nuts"/"almonds"/"cashews"/"walnuts"/"hazelnuts" → Tree nuts; "peanuts"/"groundnuts" → Peanuts;
  "prawn"/"shrimp"/"crab"/"lobster"/"crayfish" → Crustaceans; "mussels"/"clams"/"oysters"/"squid"/"octopus" → Molluscs;
  "soya"/"soybeans" → Soy; "sulphur dioxide"/"sulfites" → Sulphites.
  Normalise prefixes — "Includes Dairy" / "Contains Dairy" both become "Dairy"; "May Contain Peanuts" becomes "Peanuts".
- ALLERGENS ARE STATED-DATA ONLY (same discipline as spiciness below — do NOT guess): extract an allergen
  ONLY when the source menu STATES it — an explicit label ('GF', 'VG', 'contains nuts', 'N'), a listed
  ingredient that is itself an allergen, or an allergen / "contains" / "may contain" note. NEVER infer an
  allergen from the dish NAME alone or from what a dish "probably" contains. If there is NO stated allergen
  data for an item, leave its allergens array EMPTY — do not guess.
- dietary: extract dietary preference labels as a separate array (e.g. ["Vegetarian", "Vegan", "Halal", "Kosher"])
- spiciness: a BEST-EFFORT integer heat rating from 1 to 3, ONLY when there's a clear signal.
  Chili emoji: one chili (e.g. 🌶) = 1, two = 2, three = 3.
  Wording: "mild" = 1; "medium" = 2; "hot"/"very spicy"/"extra hot" = 3; "spice level N" = N (clamp to 1-3).
  If there is NO clear spice signal, OMIT the field (or set it null) — do NOT guess. Most items have no spiciness.
- If price is unclear or missing, use 0
- Group items logically — don't create more than 8 categories
- Return ONLY valid JSON, no markdown

MODIFIER GROUPS (options/variants) — each item MAY carry an optional "modifierGroups" array:
- VARIANT COLLAPSING (be EAGER): when the SAME base dish is listed multiple times differing ONLY by
  one varying axis (protein/size/etc.), COLLAPSE them into ONE item using the base name, plus a
  modifierGroup of the varying options. Each option price is the DELTA above the base (cheapest)
  price. Mark these groups "_inferredFromVariants": true.
  - DETERMINISTIC RULE (always apply): if two or more items share an IDENTICAL base-name prefix and
    the ONLY difference is a single trailing/embedded PROTEIN or SIZE token, ALWAYS collapse them into
    ONE item with a choice group — REGARDLESS of whether the prices are equal or differ.
    • Protein tokens: Beef, Chicken, Prawn, Prawns, Duck, Veg, Vegetable, Vegetarian, Tofu, Lamb,
      Pork, Fish, Salmon, Paneer, Halloumi, Mushroom, King Prawn.
    • Size tokens: Small, Regular, Medium, Large, Sm, Reg, Lg.
  - ANTI-OVER-MERGE GUARD (sharpened): do NOT collapse items whose differing token is NOT a protein
    or size. If the difference is a dish-TYPE word — sauce/curry/flavour/topping — they are DIFFERENT
    dishes, keep them SEPARATE. E.g. "Green Curry" vs "Red Curry" differ by curry-TYPE (not protein)
    → TWO dishes. "Margherita Pizza" vs "Pepperoni Pizza" differ by topping → TWO dishes.
  - WORKED EXAMPLES:
    • "Tom Yum Prawn £9.50 / Tom Yum Chicken £9.50" → ONE item "Tom Yum" + protein group
      [Prawn £0, Chicken £0]. (Equal price still collapses — protein token differs.)
    • "Pad Thai Beef £9 / Pad Thai Prawn £10.50 / Pad Thai Chicken £9" → ONE item "Pad Thai" + protein
      group [Beef £0, Chicken £0, Prawn £1.50].
    • "Green Curry Chicken / Red Curry Chicken" → TWO dishes (the differing token Green/Red is a
      curry-TYPE, not a protein — keep separate).
  - "similar price" (when used as a soft signal elsewhere) means within £1; but per the deterministic
    rule above, price equality is NOT required to collapse a protein/size variant. Over-grouping a
    protein/size axis is cheap (the operator can split later); under-grouping is worse — so lean in.
- EXPLICIT GROUPS: when the menu STATES a choice ("choice of protein: chicken/beef/prawn",
  "add extras (£1.50): cheese, bacon"), extract it as a modifierGroup directly. These are NOT
  inferred — set "_inferredFromVariants": false.
- Each option is { "name", "price", "allergens"?, "dietary"? }. The price is the up-charge above the
  item's base price (0 for no extra charge).
- "isRequired": whether the customer MUST choose. Set true ONLY on EXPLICIT signals ("choose one",
  "select your…", "required", "pick a…"). DEFAULT false. (A wrong "required" blocks ordering, so
  when in doubt, false.)
- "singleSelect": whether only ONE option may be picked. A variant-inferred group (pick one
  protein) MAY be true. An "add extras" list is false (multi). DEFAULT false when unclear.
- OPTION allergens/dietary: extract these for each option the SAME way you do for dishes — populate
  "allergens"/"dietary" when the option's name or the menu text indicates one (e.g. Prawn →
  ["Crustaceans"], Cheese → ["Dairy"], Halloumi → ["Dairy"]), using the SAME normalised allergen/
  dietary vocabulary as the dish rules above. Omit (or empty) when there is no signal. The operator
  reviews and is responsible for the final allergen info — your job is to surface what you detect.
${existingItemsSummary ? `\nTHIS OPERATOR'S EXISTING MENU (use to match their structure):\n- Existing dishes: ${existingItemsSummary}\n- Existing modifier groups: ${existingGroupsSummary || '(none)'}\n- If an existing group matches a pattern you detect, REUSE its exact name. If two dishes already exist as SEPARATE items (e.g. "Green Curry" and "Red Curry"), do NOT merge them on this import — respect the established structure.` : ''}

Response format:
{
  "categories": ["Mains", "Sides", "Drinks"],
  "items": [
    {
      "name": "Tiramisu",
      "description": "Layers of delicate ladyfingers soaked in espresso and marsala wine, mascarpone, cream and a dusting of cocoa.",
      "price": 6.50,
      "category": "Desserts",
      "allergens": ["Dairy", "Lactose", "Gluten", "Eggs"],
      "dietary": ["Vegetarian"],
      "spiciness": null
    },
    {
      "name": "Pad Thai",
      "description": "Stir-fried rice noodles with egg, beansprouts, peanuts and tamarind.",
      "price": 9.00,
      "category": "Mains",
      "allergens": ["Peanuts", "Eggs"],
      "dietary": [],
      "spiciness": 1,
      "modifierGroups": [
        {
          "name": "Protein",
          "options": [ { "name": "Chicken", "price": 0 }, { "name": "Beef", "price": 0 }, { "name": "Prawn", "price": 1.50, "allergens": ["Crustaceans"] } ],
          "isRequired": false,
          "singleSelect": true,
          "_inferredFromVariants": true
        }
      ]
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

  // ── Per-attempt timeout — SIZED TO THE CLIENT'S ESCAPE LADDER, not to the route ceiling ────────────────
  // The timeout exists only to catch a GENUINE HANG — never to truncate a working-but-slow call. 25s did
  // the latter (Gemini flash normally runs ~18-30s) and killed a real prospect's upload on 24 July:
  // AbortError ×3, 80s burnt, demo dead. The route ceiling is 300s (app/api/demo/route.ts maxDuration), so
  // the ceiling is NOT the binding constraint — the visitor's patience is.
  //
  // 90s is chosen to sit just AFTER the client's last escape hatch, so the ladder always completes:
  //     60s  DemoUpload SLOW_PROMPT_AT   — "taking longer than usual" (reassurance)
  //     75s  DemoUpload SAMPLE_OFFER_AT  — offer the authored sample menus (the escape)
  //     90s  THIS abort                  — honest-failure path
  // The visitor is given the choice at 75s; the server only decides once they've declined it. Any earlier
  // and the abort would replace the sample offer with a failure screen a second after it appeared.
  //
  // HEADROOM against the 300s route ceiling (worst case, see the no-retry-on-abort note below):
  //     provisionTruck ~5s + extraction ≤ ~100s (90s stall + 2s+4s backoff + three short 429/503 replies)
  //     + reserve ~15s (commitMenu's ~85 round trips + event provisioner + seeding + slot rebuild)
  //     ≈ 120s used, ≈ 180s spare.
  const EXTRACT_TIMEOUT_MS = 90_000

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody), signal: controller.signal }
      )

      const data = await res.json()

      // 🔴 THE ONLY RETRYABLE SET: 429 (rate limit) / 503 (overload) — transient, worth another attempt.
      if (data.error?.code === 429 || data.error?.code === 503) {
        const waitMs = attempt * 2000
        await new Promise(r => setTimeout(r, waitMs))
        lastError = new Error(data.error.message)
        continue
      }

      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (responseText) break

      // Parsed, but no usable text (or a non-429/503 error payload) — NOT transient. Fail out, don't repeat.
      lastError = new Error(data.error?.message ?? 'Empty response from AI')
      break
    } catch (err) {
      // Thrown = network failure or an ABORT (our timeout fired at EXTRACT_TIMEOUT_MS). An abort now means a
      // GENUINE HANG, not a transient fault — DO NOT RETRY (retrying would multiply a 90s bound to 270s and
      // buy the same outcome three times; the 24 July failure was exactly that shape at the old 25s).
      // Break straight out; after the loop the SAME MenuExtractionError throws → the honest-failure path.
      lastError = err as Error
      break
    } finally {
      clearTimeout(timeout)
    }
  }

  if (!responseText) {
    console.error('[menu-extract] All retries failed:', lastError)
    throw new MenuExtractionError('AI processing failed — please try again')
  }

  try {
    const parsed = JSON.parse(responseText)

    const items = (parsed.items || []).map((item: any) => {
      // Per-item modifier groups (Stage 1, extraction-only). Options carry name + price + optional
      // allergens/dietary — POPULATED when the AI detects them (same treatment as dish allergens;
      // the operator reviews and owns the final allergen info). Arrays default to [] (consistent
      // with dishes). Flags default conservatively (a wrong "required" blocks ordering).
      const modifierGroups = Array.isArray(item.modifierGroups)
        ? item.modifierGroups
            .filter((g: any) => g && g.name && Array.isArray(g.options) && g.options.length > 0)
            .map((g: any) => ({
              name: String(g.name),
              options: g.options
                .filter((o: any) => o && o.name)
                .map((o: any) => ({
                  name: String(o.name),
                  price: typeof o.price === 'number' ? o.price : 0,
                  allergens: Array.isArray(o.allergens) ? o.allergens : [],
                  dietary: Array.isArray(o.dietary) ? o.dietary : [],
                })),
              isRequired: g.isRequired === true,        // default false
              singleSelect: g.singleSelect === true,    // default false
              _inferredFromVariants: g._inferredFromVariants === true,
            }))
            .filter((g: any) => g.options.length > 0)
        : undefined

      return {
        ...item,
        price: typeof item.price === 'number' ? item.price : 0,
        price_missing: !item.price || item.price === 0,
        allergens: item.allergens || [],
        dietary: item.dietary || [],
        // Best-effort heat rating: a clean integer 1/2/3 survives; anything else (null, 0,
        // out-of-range, non-numeric) → null. Never trust the fuzzy model output via spread alone.
        spiciness: [1, 2, 3].includes(Number(item.spiciness)) ? Number(item.spiciness) : null,
        // Only attach when the model proposed groups (most items have none — keep payload clean).
        ...(modifierGroups && modifierGroups.length ? { modifierGroups } : {}),
      }
    })

    return {
      categories: parsed.categories || [],
      items,
      existing_categories: existingCatNames,
    }
  } catch (err) {
    if (err instanceof MenuExtractionError) throw err
    console.error('[menu-extract] JSON parse error:', err)
    throw new MenuExtractionError('Failed to process menu')
  }
}
