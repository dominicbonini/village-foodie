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

export async function generateWhatsAppReply(params: ClassifierParams): Promise<string | null> {
  const {
    truckName, customerMessage, events,
    scheduleUrl, orderUrl
  } = params

  const todayStr = new Date().toISOString().split('T')[0]
  const todayFriendly = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const eventsSection = events.length > 0
    ? `UPCOMING EVENTS (dates include TODAY/TOMORROW labels for clarity):\n${events.map(e => formatEventForPrompt(e, todayStr)).join('\n')}`
    : 'UPCOMING EVENTS: None currently scheduled'

  const prompt = `You are a helpful assistant for ${truckName}, a food truck.

Today is ${todayFriendly}.
Today's date string: ${todayStr}

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
- For SPECIFIC_QUERY: search confirmed events for a match to their query. If the customer asks about tomorrow, look for events labelled (TOMORROW). If the customer asks about today, look for events labelled (TODAY). If the customer asks about a specific village or town, check if any event's venue name or town field matches or is nearby — if no town data is available, mention the venue name and suggest they check the schedule link for full location details. If found, reply with specific venue, date and time, and the order link. If only unconfirmed events match, say you don't have anything confirmed yet for that date/area and provide the schedule link. If the customer asks about a specific location with no events that day, check if there are upcoming confirmed events at that location within the next 7 days and mention the next one — e.g. "Nothing in Wickhambrook tomorrow but we'll be there on Friday 29 May at Village Hall 17:00–20:00 🙌". If nothing at all matches, provide schedule link only.
- For GENERAL_QUERY: reply with order link and schedule link. Keep it friendly and brief.
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
