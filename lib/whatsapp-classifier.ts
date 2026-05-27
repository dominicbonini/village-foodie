interface TruckEvent {
  event_date: string
  start_time: string | null
  end_time: string | null
  venue_name: string | null
  town: string | null
  postcode: string | null
  status: string
}

interface ClassifierParams {
  truckName: string
  truckId: string
  customerMessage: string
  events: TruckEvent[]
  scheduleUrl: string
  orderUrl: string
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
  classification: string
}

export async function generateWhatsAppReply(params: ClassifierParams): Promise<WhatsAppReplyResult> {
  const { truckName, customerMessage, events, scheduleUrl, orderUrl } = params

  // Step 1: classify with a generous, keyword-aware prompt
  const classifierPrompt = `Classify this customer message into one of three categories:

SPECIFIC_QUERY — customer is asking about schedule, location, dates, or availability.
Examples of SPECIFIC_QUERY (be generous — classify as SPECIFIC_QUERY if in doubt):
- "where are you tomorrow"
- "where are you tomorrow night"
- "are you out this Friday"
- "what time are you there on Friday"
- "will you be in Wickhambrook this week"
- "are you near me this weekend"
- "when are you next in the village"
- "where are you at the weekend"
- "trading this week"
- "what days are you out"
- "when's your next event"
- ANY question containing: tomorrow, tonight, Friday, Saturday, Sunday, Monday, Tuesday, Wednesday, Thursday, this week, next week, weekend, today, near, village, town, location, where, when, schedule, trading

GENERAL_QUERY — asking about menu, prices, ordering, or general info.
Examples: "what do you sell", "how much is a pizza", "do you do gluten free"

IGNORE — spam, gibberish, complaints, booking requests, or completely unrelated.

Message: "${customerMessage}"

Reply with exactly one word: SPECIFIC_QUERY, GENERAL_QUERY, or IGNORE`

  let classification: string
  try {
    classification = (await callGemini(classifierPrompt, 0.1)).toUpperCase()
  } catch {
    classification = 'SPECIFIC_QUERY' // fail open
  }

  if (classification === 'IGNORE') return { reply: null, classification: 'IGNORE' }

  if (classification === 'GENERAL_QUERY') {
    return {
      reply: `Hey! You can check out our menu and pre-order here: ${orderUrl} 🍽️\n\n${truckName}`,
      classification: 'GENERAL_QUERY',
    }
  }

  // Step 2: SPECIFIC_QUERY — reply with explicit date mapping so Gemini never guesses
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

  const replyPrompt = `You are a helpful assistant for ${truckName}, a food truck.

DATE REFERENCE (use these exact mappings — do not guess):
${dateMapping}

Upcoming confirmed events:
${formattedEvents.length > 0 ? formattedEvents.join('\n') : 'No upcoming events.'}

Customer message: "${customerMessage}"

Instructions:
- Match the customer's date reference (tomorrow, Friday, tonight, this week etc) using the DATE REFERENCE above
- If they ask about a day by name (e.g. "Friday"), look up the exact date from DATE REFERENCE
- If events exist for that date, give venue name, town and times in a friendly tone
- If asked about a location (village/town), check if any event's town field matches
- If no event that specific day but there are upcoming events at that location within 7 days, mention the next one: "Nothing tomorrow but we're in Wickhambrook on Friday!"
- If no event that specific day but there are other upcoming events, mention the next one
- Always end with the order link: ${orderUrl}
- Keep response under 3 sentences, friendly tone
- Sign off as ${truckName}
- Use 1-2 relevant emojis max. Never mention Village Foodie or any platform name. Never make up events.`

  try {
    const reply = await callGemini(replyPrompt, 0.4)
    return { reply: reply || null, classification: 'SPECIFIC_QUERY' }
  } catch (err) {
    console.error('[WhatsApp classifier] Gemini error:', err)
    return {
      reply: `Hey! Check out our latest schedule here: ${scheduleUrl}\n\n${truckName}`,
      classification: 'SPECIFIC_QUERY',
    }
  }
}
