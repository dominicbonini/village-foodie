import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TruckEvent {
  event_date: string
  start_time: string | null
  end_time: string | null
  venue_name: string | null
  town: string | null
  postcode: string | null
  status: string
}

interface MenuItem {
  name: string
  category: string
  price?: number | null
  allergens?: string | null
}

interface ClassifierParams {
  customerMessage: string
  truckName: string
  truckEmoji: string
  truckId: string
  orderUrl: string
  scheduleUrl: string
  events: TruckEvent[]
  menuItems?: MenuItem[]
}

function formatEventForPrompt(event: TruckEvent, todayStr: string): string {
  const eventDate = new Date(event.event_date + 'T12:00:00')
  const today = new Date(todayStr + 'T12:00:00')
  const diffDays = Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let relativeLabel = ''
  if (diffDays === 0) relativeLabel = ' (TODAY)'
  else if (diffDays === 1) relativeLabel = ' (TOMORROW)'
  else if (diffDays === 2) relativeLabel = ' (IN 2 DAYS)'

  const friendlyDate = eventDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  })
  const start = event.start_time?.substring(0, 5) || ''
  const end = event.end_time?.substring(0, 5) || ''
  const time = start && end ? `${start}–${end}` : start || 'time TBC'
  const location = [event.venue_name, event.town, event.postcode].filter(Boolean).join(', ')
  const confirmed = event.status === 'confirmed' || event.status === 'open'
  return `- ${friendlyDate}${relativeLabel}: ${location} ${time} [${confirmed ? 'CONFIRMED' : 'UNCONFIRMED'}]`
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

async function callGemini(prompt: string, temperature: number): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature }
    })
  })
  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
}

export interface WhatsAppReplyResult {
  reply: string | null
  classification: 'SPECIFIC_QUERY' | 'MENU_QUERY' | 'ALLERGEN_QUERY' | 'IGNORE'
}

export async function generateWhatsAppReply(params: ClassifierParams): Promise<WhatsAppReplyResult> {
  const { truckName, truckEmoji, truckId, customerMessage, events, scheduleUrl, orderUrl } = params

  // Step 1: classify — ALLERGEN_QUERY listed before MENU_QUERY so allergen+food messages
  // route to the safety-first bucket rather than the general menu bucket.
  const classifierPrompt = `Classify this customer WhatsApp message to a food truck into exactly one category.

SPECIFIC_QUERY — asking about schedule, location, dates, times, or where the truck is.
Examples: "where are you this weekend", "are you in Cambridge tomorrow", "when are you next near me", "are you trading today"
Triggers: any mention of tomorrow, tonight, today, a day of the week, this week, next week, weekend, near, village, town, location, where, when, schedule, trading

ALLERGEN_QUERY — asking specifically about allergens, ingredients, or dietary requirements for safety reasons.
Examples: "do any of your items contain nuts", "is your food gluten free", "what allergens are in your pizza", "my child has a dairy allergy"
Triggers: allerg, gluten, nuts, peanut, dairy, milk, egg, soy, wheat, celiac, coeliac, intoleran, ingredient, contain

MENU_QUERY — asking about food, the menu, what's available, pricing, or dietary options (vegetarian, vegan, halal etc).
Examples: "what's on the menu", "how much are your pizzas", "do you do vegetarian", "what do you sell", "what food do you have"
Triggers: menu, food, eat, dish, price, cost, how much, vegetarian, halal, kosher, options, what do you do, what do you serve

IGNORE — spam, gibberish, complaints, requests to book the truck for events, or completely unrelated messages.
Examples: "can you cater my wedding", "you were late last time", "asdfghjkl"

Message: "${customerMessage}"
Reply with exactly one word: SPECIFIC_QUERY, MENU_QUERY, ALLERGEN_QUERY, or IGNORE`

  let classification: 'SPECIFIC_QUERY' | 'MENU_QUERY' | 'ALLERGEN_QUERY' | 'IGNORE'
  try {
    const raw = (await callGemini(classifierPrompt, 0.1)).toUpperCase()
    if (
      raw === 'SPECIFIC_QUERY' ||
      raw === 'MENU_QUERY' ||
      raw === 'ALLERGEN_QUERY' ||
      raw === 'IGNORE'
    ) {
      classification = raw
    } else {
      classification = 'MENU_QUERY' // fail open — safer than SPECIFIC_QUERY (no event data needed)
    }
  } catch {
    classification = 'MENU_QUERY'
  }

  if (classification === 'IGNORE') return { reply: null, classification: 'IGNORE' }

  // ── MENU_QUERY ─────────────────────────────────────────────────────────────
  if (classification === 'MENU_QUERY') {
    const menuFallback = `Hey! 👋 ${truckEmoji} You can check out our full menu here: ${orderUrl} — ${truckName} ${truckEmoji}`
    try {
      const { data: items } = await supabase
        .from('menu_items_db')
        .select('name, category, price')
        .eq('truck_id', truckId)
        .eq('is_active', true)
        .eq('is_available', true)

      if (!items?.length) return { reply: menuFallback, classification: 'MENU_QUERY' }

      // Group by category, find min price per category
      const byCategory: Record<string, number[]> = {}
      for (const item of items) {
        const cat = item.category || 'Other'
        if (!byCategory[cat]) byCategory[cat] = []
        if (typeof item.price === 'number') byCategory[cat].push(item.price)
      }

      const parts = Object.entries(byCategory).map(([cat, prices]) => {
        const min = prices.length ? Math.min(...prices) : null
        return min !== null ? `${cat} from £${min.toFixed(2)}` : cat
      })

      const menuSummary =
        parts.length === 1
          ? parts[0]
          : parts.length === 2
          ? `${parts[0]} and ${parts[1]}`
          : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`

      return {
        reply: `Hey! 👋 ${truckEmoji} We've got ${menuSummary}. Check out the full menu and order ahead here: ${orderUrl} — ${truckName} ${truckEmoji}`,
        classification: 'MENU_QUERY',
      }
    } catch {
      return { reply: menuFallback, classification: 'MENU_QUERY' }
    }
  }

  // ── ALLERGEN_QUERY ─────────────────────────────────────────────────────────
  if (classification === 'ALLERGEN_QUERY') {
    const allergenFallback = `Hey! 👋 ${truckEmoji} Thanks for checking — please message us directly about allergens as we want to make sure we give you accurate information.\n\nPlease confirm directly with us before ordering if you have a severe allergy — ingredients can change and cross-contamination is possible.\n\n${truckName} ${truckEmoji}`
    try {
      const { data: items } = await supabase
        .from('menu_items_db')
        .select('name, allergens')
        .eq('truck_id', truckId)
        .eq('is_active', true)

      const allergenData = items?.length
        ? items.map(i => `${i.name}: ${i.allergens || 'no allergen info recorded'}`).join('\n')
        : 'No allergen data available.'

      const allergenPrompt = `You are answering a WhatsApp message on behalf of a food truck called "${truckName}" ${truckEmoji}.

The customer asked: "${customerMessage}"

Here is the allergen information for our menu items:
${allergenData}

Instructions:
- Answer the specific allergen question directly and helpfully based on the data above
- If the allergen data is empty or incomplete, say you don't have full allergen details available right now
- ALWAYS end with this exact safety line on a new line: "Please confirm directly with us before ordering if you have a severe allergy — ingredients can change and cross-contamination is possible."
- Keep the response to 3-4 sentences maximum
- Warm, friendly tone — like the owner typing it
- Sign off as: ${truckName} ${truckEmoji}
- Start with: "Hey! 👋 ${truckEmoji}"
- Never invent allergen information not in the data provided`

      const reply = await callGemini(allergenPrompt, 0.2)
      return { reply: reply || allergenFallback, classification: 'ALLERGEN_QUERY' }
    } catch (err) {
      console.error('[WhatsApp classifier] allergen Gemini error:', err)
      return { reply: allergenFallback, classification: 'ALLERGEN_QUERY' }
    }
  }

  // ── SPECIFIC_QUERY ─────────────────────────────────────────────────────────
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const dateMapping = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayNames[d.getDay()]
    const friendly = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    return `${label} = ${dateStr} (${friendly})`
  }).join('\n')

  const formattedEvents = events.map(e => formatEventForPrompt(e, todayStr))

  const replyPrompt = `You are the owner of ${truckName} ${truckEmoji}, a food truck. Reply warmly to this WhatsApp message.

DATE REFERENCE (use these exact mappings — do not guess):
${dateMapping}

Upcoming confirmed events:
${formattedEvents.length > 0 ? formattedEvents.join('\n') : 'No upcoming events.'}

Customer message: "${customerMessage}"

Instructions:
- Open with exactly: "Hey! 👋 ${truckEmoji}"
- Match the customer's date reference (tomorrow, Friday, tonight, this week etc) using the DATE REFERENCE above
- If they ask about a day by name (e.g. "Friday"), look up the exact date from DATE REFERENCE
- If events exist for that date, give venue name, town and times in a friendly tone
- If asked about a location (village/town), check if any event's town field matches
- If no event that specific day but upcoming events at that location within 7 days, mention the next one: "Nothing tomorrow but we're in Wickhambrook on Friday!"
- If no event that specific day but other upcoming events exist, mention the next one
- Always end with the order link: ${orderUrl}
- Keep to 2-3 sentences, warm and casual — like the owner typed it
- Sign off as: ${truckName} ${truckEmoji}
- Never mention Village Foodie or any platform name. Never make up events.`

  const specificFallback = `Hey! 👋 ${truckEmoji} Check out our latest schedule here: ${scheduleUrl}\n\n${truckName} ${truckEmoji}`

  try {
    const reply = await callGemini(replyPrompt, 0.4)
    return { reply: reply || specificFallback, classification: 'SPECIFIC_QUERY' }
  } catch (err) {
    console.error('[WhatsApp classifier] Gemini error:', err)
    return { reply: specificFallback, classification: 'SPECIFIC_QUERY' }
  }
}
