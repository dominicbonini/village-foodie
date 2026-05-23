interface TruckEvent {
  event_date: string
  start_time: string | null
  end_time: string | null
  venue_name: string | null
  village: string | null
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

function formatEventForPrompt(event: TruckEvent): string {
  const date = new Date(event.event_date).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  })
  const time = event.start_time && event.end_time
    ? `${event.start_time}–${event.end_time}`
    : event.start_time || 'time TBC'
  const location = [event.venue_name, event.village].filter(Boolean).join(', ')
  const confirmed = event.status === 'confirmed' || event.status === 'open'
  return `- ${date}: ${location} ${time} [${confirmed ? 'CONFIRMED' : 'UNCONFIRMED'}]`
}

export async function generateWhatsAppReply(params: ClassifierParams): Promise<string | null> {
  const {
    truckName, customerMessage, events,
    scheduleUrl, orderUrl
  } = params

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const eventsSection = events.length > 0
    ? `UPCOMING EVENTS:\n${events.map(formatEventForPrompt).join('\n')}`
    : 'UPCOMING EVENTS: None currently scheduled'

  const prompt = `Today is ${today}. You are handling WhatsApp messages for ${truckName}, a food truck.

${eventsSection}

Schedule page: ${scheduleUrl}
Order/pre-order page: ${orderUrl}

Customer message: "${customerMessage}"

TASK: Classify this message and generate a reply if appropriate.

CLASSIFICATION RULES:
- SPECIFIC_QUERY: customer asking about a specific date, day, or location (e.g. "where are you tonight", "are you in Wickhambrook this weekend", "when are you next at The Crown")
- GENERAL_QUERY: customer asking about ordering, menu, schedule, how to order, where to find them generally
- IGNORE: complaints, personal questions, booking requests, anything unrelated to schedule/ordering

REPLY RULES:
- For SPECIFIC_QUERY: search confirmed events for a match to their query. If found, reply with specific venue, date and time, and the order link. If only unconfirmed events match, say you don't have anything confirmed yet for that date/area and provide the schedule link. If nothing at all matches, provide schedule link only.
- For GENERAL_QUERY: reply with schedule link. Keep it friendly and brief.
- For IGNORE: return null — do not reply.

TONE: Casual, warm, like the truck owner typed it. Include the truck name at the end. Use 1-2 relevant emojis max. Never mention Village Foodie or any platform name. Never make up events that aren't in the list above.

RESPONSE FORMAT — return valid JSON only:
{
  "classification": "SPECIFIC_QUERY" | "GENERAL_QUERY" | "IGNORE",
  "reply": "the reply text" | null
}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json'
          }
        })
      }
    )

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null

    const parsed = JSON.parse(text)
    return parsed.reply || null

  } catch (err) {
    console.error('[WhatsApp classifier] Gemini error:', err)
    return `Hey! Check out our latest schedule here: ${scheduleUrl}\n\n${truckName}`
  }
}
