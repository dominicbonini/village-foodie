import { createClient } from '@supabase/supabase-js'
import { formatTime, formatYmd, getLocalDateInTz, addDaysYmd, type TimeSettings } from '@/lib/time-utils'
import { formatMajor, currencySymbol, type MoneyFormat } from '@/lib/money-format'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/whatsappCustomer'

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
  // OPTIONAL ABORT BUDGET FOR THE TWO callGemini SITES THAT NEVER HAD ONE -- the classifier call and the
  // SPECIFIC_QUERY reply call. The tier-3 menu answerer keeps its own hard-coded 8000 and is NOT touched
  // by this; harmonising the two would change live behaviour, which this deliberately does not.
  //
  // OMITTED => undefined => callGemini's `timeoutMs ? new AbortController() : undefined` builds NOTHING,
  // exactly as before. An absent argument and an explicit `undefined` are the same binding in JS, so the
  // two existing webhook callers are byte-unchanged and behave identically. This is additive only.
  //
  // WHY IT EXISTS: on a Meta-retried webhook a hung Gemini call is survivable. On an interactive caller
  // (the operator-facing preview) it is a spinner that never resolves, and the caller cannot reach
  // callGemini's own parameter from outside. See docs/whatsapp-simulator-seam-report.md 5.a.
  timeoutMs?: number
  /** 🔴 THE TRUCK'S MONEY FORMAT (lib/money-server moneyFormatForTruck) — every price a reply quotes,
   *  and the symbol the price check looks for. Required: a reply must never quote a guessed £. */
  money: MoneyFormat
  /** 🔴 THE TRUCK'S TIME (lib/truck-time.ts truckTimeSettings) — its "today" for the DATE REFERENCE (was
   *  the server's UTC date: from 00:00 to 01:00 BST it told the AI today was yesterday) and how dates and
   *  times read in the reply. Required. */
  time: TimeSettings
}

function formatEventForPrompt(event: TruckEvent, todayStr: string, ts: TimeSettings): string {
  const eventDate = new Date(event.event_date + 'T12:00:00')
  const today = new Date(todayStr + 'T12:00:00')
  const diffDays = Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let relativeLabel = ''
  if (diffDays === 0) relativeLabel = ' (TODAY)'
  else if (diffDays === 1) relativeLabel = ' (TOMORROW)'
  else if (diffDays === 2) relativeLabel = ' (IN 2 DAYS)'

  const friendlyDate = formatYmd(event.event_date, ts, { weekday: 'long', day: 'numeric', month: 'long' })
  const start = formatTime(event.start_time || '', ts)
  const end = formatTime(event.end_time || '', ts)
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

// 🔴 THE FIXED REPLIES' WORDS ARE IN messages/en-GB.json `whatsappCustomer` (Language Phase 1a), read in the
// truck's locale. The prompts below are not: they are instructions to the model, out of that phase's scope.
type ReplyT = ReturnType<typeof translatorFor<'whatsappCustomer'>>

// The single greeting opener, used by EVERY reply path (literals + both LLM prompts) so it can
// be turned on/off in ONE place via isFollowUp. greetingPrefix prepends it to literal strings;
// greetingInstruction tells the LLM prompts whether to open with it. See generateWhatsAppReply.

// Single source for the allergen redirect — reused by the ALLERGEN_QUERY branch AND the
// tier-3 menu-answerer's pre-LLM safety guard, so the wording can never drift between them.
// greetingPrefix is '' on a follow-up, the greeting and a space on a first message.
function allergenRedirect(t: ReplyT, truckName: string, truckEmoji: string, orderUrl: string, greetingPrefix: string): string {
  return t('allergenRedirect', { opener: greetingPrefix, url: orderUrl, truck: truckName, emoji: truckEmoji })
}

// Broad, deliberately over-triggering allergen/dietary-safety matcher. Normalises case,
// punctuation and whitespace, then does substring/stem matching. A false positive just
// redirects safely to the allergen page; a miss would let the menu LLM answer a safety
// question with no allergen data — so we err hard toward redirecting.
// OPTION B (absence-gated): the guard redirects ABSENCE/SAFETY questions ONLY — NOT presence
// questions that merely name an allergen. Confirming a TAGGED allergen ("yes, lists Dairy") is a
// safe positive declaration and now reaches the LLM (answered from tags); only ABSENCE is unsafe.
// So bare allergen NAMES (dairy, gluten, nut, soy, egg, …) and 'contain'/'ingredient' (presence/info)
// were REMOVED from the triggers. The free-from wall is now carried by ABSENCE/SAFETY signals:
//   substrings → 'allerg' (allergy/allergic), 'intoleran', 'coeliac'/'celiac', 'free from',
//                'safe for', 'suitable for'
//   whole-token 'free' → catches "gluten free"/"dairy free"/"nut free"/"free from" AFTER
//                normalisation turns "-free" into " free" (substring 'free' would over-match
//                "freely"/"carefree"; whole-token is tighter). gf/df = gluten-/dairy-free.
const ALLERGEN_STEMS = [
  'allerg', 'intoleran', 'coeliac', 'celiac',
  'free from', 'safe for', 'suitable for',
]
const ALLERGEN_TOKENS = ['gf', 'df', 'free']

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
  const { truckName, truckEmoji, truckId, customerMessage, events, scheduleUrl, orderUrl, isFollowUp = false, timeoutMs, money } = params

  // Greeting toggle, computed ONCE and threaded everywhere (no scattered conditionals).
  // greetingPrefix → literal replies (menuFallback, deterministicReply, allergenRedirect,
  // specificFallback); greetingInstruction → the two LLM prompts (tier-3 MENU + SPECIFIC_QUERY).
  const t = translatorFor(params.time?.locale, 'whatsappCustomer')
  const GREETING = t('greeting')
  const greetingPrefix = isFollowUp ? '' : t('opener', { greeting: GREETING })
  const greetingInstruction = isFollowUp
    ? 'Do NOT open with a greeting; start directly with the answer.'
    : `Open with exactly: "${GREETING}"`

  // Step 1: classify — ALLERGEN_QUERY listed before MENU_QUERY so allergen+food messages
  // route to the safety-first bucket rather than the general menu bucket.
  const classifierPrompt = `Classify this customer WhatsApp message to a food truck into exactly one category.

SPECIFIC_QUERY — asking about schedule, location, dates, times, or where the truck is.
Examples: "where are you this weekend", "are you in Cambridge tomorrow", "when are you next near me", "are you trading today"
Triggers: any mention of tomorrow, tonight, today, a day of the week, this week, next week, weekend, near, village, town, location, where, when, schedule, trading

ALLERGEN_QUERY — allergy / intolerance / coeliac or other SAFETY-framed questions, and "free from" / "safe for" / "suitable for" / "contain" questions.
Examples: "is your food gluten free", "my child has a dairy allergy", "is the pizza safe for a nut allergy", "does it contain any nuts"
Triggers: allerg, intoleran, celiac, coeliac, free from, gluten free, safe for, suitable for, contain

MENU_QUERY — asking about food, the menu, what's available, pricing, dietary options (vegetarian, vegan, halal etc), OR presence/ingredient questions like "does it have X" / "is there X in it" / "what's in it" — including a bare allergen NAME with no safety/free word.
Examples: "what's on the menu", "how much are your pizzas", "do you do vegetarian", "does the tiramisu have gluten", "is there dairy in it", "what's in the pizza"
Triggers: menu, food, eat, dish, price, cost, how much, vegetarian, halal, kosher, options, what do you serve, does it have, what's in, gluten, nuts, peanut, dairy, milk, egg, soy, wheat, ingredient

IGNORE — spam, gibberish, complaints, requests to book the truck for events, or completely unrelated messages.
Examples: "can you cater my wedding", "you were late last time", "asdfghjkl"

Message: "${customerMessage}"
Reply with exactly one word: SPECIFIC_QUERY, MENU_QUERY, ALLERGEN_QUERY, or IGNORE`

  let classification: 'SPECIFIC_QUERY' | 'MENU_QUERY' | 'ALLERGEN_QUERY' | 'IGNORE'
  try {
    // timeoutMs is undefined unless a caller opted in -- see ClassifierParams. Undefined here is the
    // pre-change behaviour exactly: no AbortController, no signal.
    const raw = (await callGemini(classifierPrompt, 0.1, timeoutMs)).toUpperCase()
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

  // DETERMINISTIC ALLERGEN/SAFETY FLOOR — runs regardless of bucket, BEFORE any branch and before
  // any of the three callGemini sites. Any message tripping an absence/safety token (allerg, free,
  // free from, safe for, suitable for, intoleran, coeliac, gf/df) redirects to the fixed allergen
  // page, so the LLM classifier can NEVER be the safety boundary. The in-branch MENU_QUERY check
  // (below) is intentionally LEFT in place as belt-and-braces. The ALLERGEN_QUERY branch redirects
  // unconditionally anyway, so this floor only changes MENU/SPECIFIC mis-classifications.
  if (mentionsAllergen(customerMessage)) {
    return { reply: allergenRedirect(t, truckName, truckEmoji, orderUrl, greetingPrefix), classification }
  }

  // ── MENU_QUERY ─────────────────────────────────────────────────────────────
  if (classification === 'MENU_QUERY') {
    const menuFallback = t('menuFallback', { opener: greetingPrefix, url: orderUrl, truck: truckName, emoji: truckEmoji })
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
        // allergens + dietary_info (both string[], same columns /api/menu surfaces) feed the tier-3
        // payload so the LLM can confirm PRESENCE (which are vegetarian; what an item lists). ABSENCE
        // is never asserted — guarded below + in the prompt.
        .select('name, category_id, price, is_available, allergens, dietary_info, menu_categories!category_id(name)')
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
        const cat = (item.menu_categories as any)?.name || t('otherCategory')
        if (!byCategory[cat]) byCategory[cat] = []
        if (typeof item.price === 'number') byCategory[cat].push(item.price)
      }

      const parts = Object.entries(byCategory).map(([cat, prices]) => {
        const min = prices.length ? Math.min(...prices) : null
        return min !== null ? t('categoryFrom', { category: cat, price: formatMajor(min, money) }) : cat
      })

      const menuSummary =
        parts.length === 1
          ? parts[0]
          : parts.length === 2
          ? t('listTwo', { first: parts[0], second: parts[1] })
          : t('listMany', { init: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] })

      // Deterministic category summary — kept as the fail-safe target for EVERY tier-3 path
      // below (timeout / throw / empty / blocked / price-validation fail all land here).
      const deterministicReply = t('menuSummary', { opener: greetingPrefix, summary: menuSummary, url: orderUrl, truck: truckName, emoji: truckEmoji })

      // ── Tier-3: grounded free-prose answer ──────────────────────────────────────────────
      // Replaces ONLY the success reply. The two safety guards (allergen redirect + price
      // validation) are NOT optional — this is a customer-facing AI reply with safety stakes.
      try {
        // 1) ALLERGEN GUARD (pre-LLM, safety-critical). Belt-and-braces with the classifier's
        //    own ALLERGEN bucket: catches allergen-adjacent messages that still classified as
        //    MENU (e.g. "is the pepperoni pizza gluten free?"). If it matches we redirect with
        //    the SAME fixed allergen string and never call the LLM.
        if (mentionsAllergen(customerMessage)) {
          return { reply: allergenRedirect(t, truckName, truckEmoji, orderUrl, greetingPrefix), classification: 'MENU_QUERY' }
        }

        // 2) PAYLOAD — built from items[] (already filtered is_available !== false, so
        //    everything here is orderable right now). Fields read generically so adding menu
        //    columns later flows through. price pre-formatted so the model quotes it verbatim.
        const menuPayload = items.map(i => ({
          name: i.name,
          category: (i.menu_categories as any)?.name || t('otherCategory'),
          price: typeof i.price === 'number' ? formatMajor(i.price, money) : null,
          // PRESENCE-only tags (operator declarations). Default [] when absent — but a MISSING tag
          // means "not entered", NOT "free of" / "not vegetarian"; the prompt forbids absence claims.
          dietary: (i.dietary_info as string[]) || [],
          allergens: (i.allergens as string[]) || [],
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
- The MENU includes per-item dietary tags (e.g. Vegetarian, Vegan) and allergen tags (e.g. Dairy, Gluten, Soy), entered by the operator.
- PRESENCE — you MAY confirm what is TAGGED: if asked which items are vegetarian/vegan, list the items whose dietary tags include that, phrased as "the ones marked vegetarian" (NOT "only these"). If asked what an item contains, you MAY state the allergen tags listed on it (e.g. "the BBQ Chicken lists Dairy and Gluten").
- ALLERGEN CAVEAT — ONLY when you actually STATE an item's allergen content (e.g. "lists Dairy and Gluten"): you MUST end that reply with "Please double-check the full menu for allergen info — this is an automated reply." (or a close paraphrase). Do NOT add this caveat to dietary answers (vegetarian/vegan) or to plain menu/price answers — it applies only when you affirmatively state allergen tags.
- HAS/CONTAINS an allergen (presence-named question): if asked whether an item HAS or CONTAINS a specific allergen — if that allergen IS in the item's allergen tags, confirm it ("yes, the BBQ Chicken lists Dairy"). If it is NOT in the tags, do NOT say "no" / "it doesn't contain that" / "it's free of that" — the data may be incomplete — instead say you can't confirm that here and point them to the full menu/allergen info. DEFER, never DENY.
- ABSENCE — NEVER assert, for BOTH dietary AND allergens: NEVER say an item is free of / does not contain / is safe for any allergen, and NEVER say an item is NOT vegetarian/vegan, based on a MISSING tag — the data may be incomplete. If a tag isn't present, do NOT infer its absence; point them to the full menu/allergen info for anything not listed.
- COMPLETENESS: don't imply the list is exhaustive — say "the ones marked X" and suggest checking the menu for items not listed, since not every item may be tagged.
- For other attributes you have NO data for (spicy, size, what's on it beyond the tags), do NOT guess — briefly say the full details are on the menu and give the order link.
- NEVER invent items, prices, sizes, ingredients, or dietary/allergen claims.
- Sound like the owner: warm and brief (1-3 sentences). No "I am an AI" line, no disclaimers.
- End with the order link: ${orderUrl}
- Sign off exactly as: — ${truckName} ${truckEmoji}`

        // 3) LLM CALL — reuse callGemini, low temp, 8s AbortController timeout.
        const llmReply = await callGemini(menuAnswerPrompt, 0.2, 8000)

        // 4) PRICE VALIDATION — every figure in the reply carrying the TRUCK's symbol (£, $) must exist in
        //    the payload's price set (compared numerically so £12, £12.5 and £12.50 all normalise to
        //    12.00/12.50 — a comparison key, not a display string). Any stray figure ⇒ treat the whole
        //    reply as a hallucination. Cheap, no extra call.
        const allowedPrices = new Set(
          items.filter(i => typeof i.price === 'number').map(i => (i.price as number).toFixed(2))
        )
        const sym = currencySymbol(money).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const quotedPrices = (llmReply.match(new RegExp(`${sym}\\s?\\d+(?:\\.\\d{1,2})?`, 'g')) ?? []).map(p =>
          parseFloat(p.replace(new RegExp(`${sym}|\\s`, 'g'), '')).toFixed(2)
        )
        const pricesValid = quotedPrices.every(p => allowedPrices.has(p))

        // 5) DETERMINISTIC ALLERGEN CAVEAT — guarantee (not prompt-hope) the caveat whenever the
        //    reply STATES an allergen this truck has tagged. Trigger = any allergen tag word from the
        //    payload appears (case-insensitive) in the reply. Dietary-only/plain replies have no
        //    allergen word → no caveat. Append only if not already present (no duplication).
        const ALLERGEN_CAVEAT = t('allergenCaveat')
        const allergenTagWords = new Set<string>()
        for (const i of items) for (const a of ((i.allergens as string[]) || [])) {
          const w = String(a).trim().toLowerCase()
          if (w) allergenTagWords.add(w)
        }
        const replyLower = llmReply.toLowerCase()
        const statesAllergen = [...allergenTagWords].some(w => replyLower.includes(w))
        const cavedReply = statesAllergen && !llmReply.includes(ALLERGEN_CAVEAT)
          ? `${llmReply}\n\n${ALLERGEN_CAVEAT}`
          : llmReply

        // 6) RETURN the LLM answer only if non-empty AND price-clean; otherwise fail safe.
        if (llmReply && pricesValid) {
          return { reply: cavedReply, classification: 'MENU_QUERY' }
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
      reply: allergenRedirect(t, truckName, truckEmoji, orderUrl, greetingPrefix),
      classification: 'ALLERGEN_QUERY',
    }
  }

  // ── SPECIFIC_QUERY ─────────────────────────────────────────────────────────
  // 🔴 THE TRUCK'S TODAY (Phase 2B), and its country's words for the dates.
  const todayStr = getLocalDateInTz(params.time.timeZone)

  const dateMapping = Array.from({ length: 7 }, (_, i) => {
    const dateStr = addDaysYmd(todayStr, i)
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatYmd(dateStr, params.time, { weekday: 'long' })
    const friendly = formatYmd(dateStr, params.time, { day: 'numeric', month: 'long' })
    return `${label} = ${dateStr} (${friendly})`
  }).join('\n')

  const formattedEvents = events.map(e => formatEventForPrompt(e, todayStr, params.time))

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

  const specificFallback = t('specificFallback', { opener: greetingPrefix, url: scheduleUrl, truck: truckName, emoji: truckEmoji })

  try {
    // Same opt-in as the classifier call above; undefined => unchanged.
    const reply = await callGemini(replyPrompt, 0.4, timeoutMs)
    return { reply: reply || specificFallback, classification: 'SPECIFIC_QUERY' }
  } catch (err) {
    console.error('[WhatsApp classifier] Gemini error:', err)
    return { reply: specificFallback, classification: 'SPECIFIC_QUERY' }
  }
}
