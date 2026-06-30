import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { venueName, town, postcode, country } = await req.json()

  if (!town && !postcode) {
    return NextResponse.json({ lat: null, lng: null })
  }

  const locationString = [venueName, town, postcode, country || 'UK']
    .filter(Boolean)
    .join(', ')

  const prompt = `You are a geocoding service. Return ONLY a JSON object with the latitude and longitude for this location. Be as precise as possible using the venue name, town, and postcode.

Location: "${locationString}"

Return ONLY valid JSON, no markdown, no explanation:
{ "lat": 52.1234, "lng": 0.5678, "confidence": "high|medium|low" }

If you cannot determine the location with reasonable confidence, return:
{ "lat": null, "lng": null, "confidence": "none" }`

  // Geocoding is BEST-EFFORT (it only fills latitude/longitude). A slow/stalled Gemini call must never hang
  // the event save (the "Import schedule" spinner). Hard-cap the call at 10s via AbortController: on
  // timeout the fetch aborts → falls to the catch → returns no-coordinates, so the event saves WITHOUT
  // lat/lng instead of the spinner waiting minutes for Gemini to settle.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      }
    )

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return NextResponse.json({ lat: null, lng: null })

    const parsed = JSON.parse(text)
    return NextResponse.json({
      lat: parsed.lat,
      lng: parsed.lng,
      confidence: parsed.confidence,
    })
  } catch {
    // Timeout/abort, network, or parse error → best-effort: no coordinates, NEVER block the save.
    return NextResponse.json({ lat: null, lng: null })
  } finally {
    clearTimeout(timeout)
  }
}
