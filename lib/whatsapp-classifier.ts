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
  // FIRST-message vs FOLLOW-UP greeting toggle. A human doesn't re-greet every message, so when
  // this sender has messaged recently we drop the "Hey there 👋" opener from every reply path.
  // DORMANT today: the webhook is stateless per message and has no per-sender history until the
  // whatsapp_logs prod migration is applied, so callers pass false and behaviour is unchanged.
  // LATER (one-query add): SELECT whatsapp_logs WHERE customer_number=$from AND truck_id=$id AND
  // created_at > now()-interval '4 hours' LIMIT 1 → pass its existence as isFollowUp.
  isFollowUp?: boolean
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

// timeoutMs is optional so existing callers are unchanged; when set, an AbortController
// aborts the fetch so a hung Gemini call degrades to the caller's fallback instead of
// stalling the (Meta-retried) webhook.
async function callGemini(prompt: string, temperature: number, timeoutMs?: number): Promise<string> {
  const controller = timeoutMs ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature }
      }),
      signal: controller?.signal,
    })
    const data = await res.json()
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// The single greeting opener, used by EVERY reply path (literals + both LLM prompts) so it can
// be turned on/off in ONE place via isFollowUp. greetingPrefix prepends it to literal strings;
// greetingInstruction tells the LLM prompts whether to open with it. See generateWhatsAppReply.
const GREETING = 'Hey there 👋'

// Single source for the allergen redirect — reused by the ALLERGEN_QUERY branch AND the
// tier-3 menu-answerer's pre-LLM safety guard, so the wording can never drift between them.
// greetingPrefix is '' on a follow-up, `${GREETING} ` on a first message.
function allergenRedirect(truckName: string, truckEmoji: string, orderUrl: string, greetingPrefix: string): string {
  return `${greetingPrefix}You can see our full menu and allergen information here: ${orderUrl} — ${truckName} ${truckEmoji}`
}

// Broad, deliberately over-triggering allergen/dietary-safety matcher. Normalises case,
// punctuation and whitespace, then does substring/stem matching. A false positive just
// redirects safely to the allergen page; a miss would let the menu LLM answer a safety
// question with no allergen data — so we err hard toward redirecting.
const ALLERGEN_STEMS = [
  'allerg', 'intoleran', 'gluten', 'coeliac', 'celiac', 'dairy', 'lactose',
  'nut', 'peanut', 'almond', 'cashew', 'soy', 'soya', 'egg', 'milk', 'wheat',
  'sesame', 'shellfish', 'fish', 'crustacean', 'mollusc', 'vegan',
  'free from', 'contain', 'ingredient', 'suitable for',
]
// Short ambiguous abbreviations matched as whole tokens only (substring would hit words
// like "handful"/"bagful"). gf = gluten free, df = dairy free.
const ALLERGEN_TOKENS = ['gf', 'df']

function mentionsAllergen(message: string): boolean {
  const normalised = ` ${message.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  if (ALLERGEN_STEMS.some(stem => normalised.includes(stem))) return true
  const tokens = normalised.trim().split(' ')
  return ALLERGEN_TOKENS.some(tok => tokens.includes(tok))
}

export interface WhatsAppReplyResult {
  reply: string | null
  classification: 'SPECIFIC_QUERY' | 'MENU_QUERY' | 'ALLERGEN_QUERY' | 'IGNORE'
}

export async function generateWhatsAppReply(params: ClassifierParams): Promise<WhatsAppReplyResult> {
  const { truckName, truckEmoji, truckId, customerMessage, events, scheduleUrl, orderUrl, isFollowUp = false } = params

  // Greeting toggle, computed ONCE and threaded everywhere (no scattered conditionals).
  // greetingPrefix → literal replies (menuFallback, deterministicReply, allergenRedirect,
  // specificFallback); greetingInstruction → the two LLM prompts (tier-3 MENU + SPECIFIC_QUERY).
  const greetingPrefix = isFollowUp ? '' : `${GREETING} `
  const greetingInstruction = isFollowUp
    ? 'Do NOT open with a greeting; start directly with the answer.'
    : `Open with exactly: "${GREETING}"`

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
    const menuFallback = `${greetingPrefix}You can check out our full menu here: ${orderUrl} — ${truckName} ${truckEmoji}`
    try {
      // Availability uses the CANONICAL null-tolerant rule (`is_available !== false`) — the same as
      // app/api/menu/[truckId]/route.ts and the dashboard. is_available is nullable; NULL = available,
      // only explicit false excludes. A strict `.eq('is_available', true)` dropped NULL rows that are
      // orderable on the customer page, falsely triggering the bare-link fallback. is_active stays in
      // the query (soft-deleted items must never appear); select is_available for the JS filter.
      // Category name comes from the menu_categories JOIN — menu_items_db has category_id (FK), NOT a
      // bare `category` column. Mirrors app/api/menu/[truckId]/route.ts (:69 select, :305 name).
      const { data: rows, error } = await supabase
        .from('menu_items_db')
        .select('name, category_id, price, is_available, menu_categories!category_id(name)')
        .eq('truck_id', truckId)
        .eq('is_active', true)

      // Do NOT swallow query errors (a bad column returns {data:null,error}, not a throw): surface it
      // in the logs and fall back, so the next column/query mismatch is visible instead of looking
      // like "no items". This is the structural guard that would have caught the `category` bug.
      if (error) {
        console.error('[whatsapp menu query]', error)
        return { reply: menuFallback, classification: 'MENU_QUERY' }
      }

      const items = (rows ?? []).filter(i => i.is_available !== false)

      if (!items.length) return { reply: menuFallback, classification: 'MENU_QUERY' }

      // Group by category NAME (from the join), find min price per category
      const byCategory: Record<string, number[]> = {}
      for (const item of items) {
        const cat = (item.menu_categories as any)?.name || 'Other'
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

      // Deterministic category summary — kept as the fail-safe target for EVERY tier-3 path
      // below (timeout / throw / empty / blocked / price-validation fail all land here).
      const deterministicReply = `${greetingPrefix}We've got ${menuSummary}. Check out the full menu and order ahead here: ${orderUrl} — ${truckName} ${truckEmoji}`

      // ── Tier-3: grounded free-prose answer ──────────────────────────────────────────────
      // Replaces ONLY the success reply. The two safety guards (allergen redirect + price
      // validation) are NOT optional — this is a customer-facing AI reply with safety stakes.
      try {
        // 1) ALLERGEN GUARD (pre-LLM, safety-critical). Belt-and-braces with the classifier's
        //    own ALLERGEN bucket: catches allergen-adjacent messages that still classified as
        //    MENU (e.g. "is the pepperoni pizza gluten free?"). If it matches we redirect with
        //    the SAME fixed allergen string and never call the LLM.
        if (mentionsAllergen(customerMessage)) {
          return { reply: allergenRedirect(truckName, truckEmoji, orderUrl, greetingPrefix), classification: 'MENU_QUERY' }
        }

        // 2) PAYLOAD — built from items[] (already filtered is_available !== false, so
        //    everything here is orderable right now). Fields read generically so adding menu
        //    columns later flows through. price pre-formatted so the model quotes it verbatim.
        const menuPayload = items.map(i => ({
          name: i.name,
          category: (i.menu_categories as any)?.name || 'Other',
          price: typeof i.price === 'number' ? `£${i.price.toFixed(2)}` : null,
        }))

        const menuAnswerPrompt = `You are the owner of ${truckName} ${truckEmoji}, a food truck, replying to a customer's WhatsApp message about your menu.

MENU (JSON — your ONLY source of truth; every item listed is available to order right now):
${JSON.stringify(menuPayload, null, 2)}

Customer message: "${customerMessage}"

Rules (follow exactly — same discipline as "never make up events"):
- ${greetingInstruction}
- Answer ONLY using items in the MENU above. Everything listed is available to order now.
- Quote prices EXACTLY as written in the MENU. If an item's price is null, do not state a price — point them to the order link instead.
- If they ask about an item that is NOT in the MENU, say we don't have it and point them to the order link.
- If they ask about an attribute you do NOT have data for (spicy, vegetarian, vegan, size, ingredients, what's on it), do NOT guess — briefly say the full details are on the menu and give the order link. The ONLY facts you have are each item's name, category, price and that it is available.
- If they ask about allergens or ingredients for dietary-safety reasons, say you can't confirm that here and point them to the menu/allergen page.
- NEVER invent items, prices, sizes, ingredients, or dietary/allergen claims.
- Sound like the owner: warm and brief (1-3 sentences). No "I am an AI" line, no disclaimers.
- End with the order link: ${orderUrl}
- Sign off exactly as: — ${truckName} ${truckEmoji}`

        // 3) LLM CALL — reuse callGemini, low temp, 8s AbortController timeout.
        const llmReply = await callGemini(menuAnswerPrompt, 0.2, 8000)

        // 4) PRICE VALIDATION — every £ figure in the reply must exist in the payload's price
        //    set (compared numerically so £12, £12.5 and £12.50 all normalise to 12.00/12.50).
        //    Any stray figure ⇒ treat the whole reply as a hallucination. Cheap, no extra call.
        const allowedPrices = new Set(
          items.filter(i => typeof i.price === 'number').map(i => (i.price as number).toFixed(2))
        )
        const quotedPrices = (llmReply.match(/£\s?\d+(?:\.\d{1,2})?/g) ?? []).map(p =>
          parseFloat(p.replace(/[£\s]/g, '')).toFixed(2)
        )
        const pricesValid = quotedPrices.every(p => allowedPrices.has(p))

        // 5) RETURN the LLM answer only if non-empty AND price-clean; otherwise fail safe.
        if (llmReply && pricesValid) {
          return { reply: llmReply, classification: 'MENU_QUERY' }
        }
        return { reply: deterministicReply, classification: 'MENU_QUERY' }
      } catch {
        // ANY throw/timeout/abort in the tier-3 section → deterministic summary, never silence.
        return { reply: deterministicReply, classification: 'MENU_QUERY' }
      }
    } catch {
      return { reply: menuFallback, classification: 'MENU_QUERY' }
    }
  }

  // ── ALLERGEN_QUERY ─────────────────────────────────────────────────────────
  // SAFETY/LEGAL: we NEVER auto-answer allergen questions. A wrong automated allergen reply is
  // a serious safety + liability risk, so there is NO LLM call and NO item-specific content
  // (no "contains/doesn't contain", no inference). The reply is a FIXED redirect to the
  // authoritative menu + allergen page (/trucks/[slug]/order), regardless of how specific the
  // question was. Greeting "Hey there" + 👋; no food emoji at the start; the truck's selected
  // emoji once at the end; link always included.
  if (classification === 'ALLERGEN_QUERY') {
    return {
      reply: allergenRedirect(truckName, truckEmoji, orderUrl, greetingPrefix),
      classification: 'ALLERGEN_QUERY',
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
- ${greetingInstruction}
- Do NOT use any food emoji in the greeting or body. The ONLY food emoji is ${truckEmoji}, used once at the very end in the sign-off.
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

  const specificFallback = `${greetingPrefix}Check out our latest schedule here: ${scheduleUrl}\n\n${truckName} ${truckEmoji}`

  try {
    const reply = await callGemini(replyPrompt, 0.4)
    return { reply: reply || specificFallback, classification: 'SPECIFIC_QUERY' }
  } catch (err) {
    console.error('[WhatsApp classifier] Gemini error:', err)
    return { reply: specificFallback, classification: 'SPECIFIC_QUERY' }
  }
}
