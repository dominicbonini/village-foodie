// app/api/admin/screenshot-events/route.ts
//
// ADMIN ONLY. Upload one or several event screenshots; each becomes events for the trucks named in it.
// Replaces the Apps Script's processFoodTruckScreenshots (Drive folder + time trigger) with a surface
// Dominic drives himself. ⚠️ The Apps Script path is NOT removed and keeps running until its trigger is
// turned off; this writes `source = 'Admin Screenshot'` so the two stay separable in the data.
//
// ── 🔴 NOTHING IS STORED SERVER-SIDE ────────────────────────────────────────────────────────────────
// The image is read from the request, passed to Gemini, and dropped when the request ends. No bucket,
// no object, no retention. Requested explicitly: "no need to store".
//
// ⚠️ THE DEFECT THIS STILL HAS TO AVOID. The Drive path's `file.setTrashed(true)` (v6.57 orig :748)
// sits AFTER BOTH branches of its if/else, so a call that succeeded but yielded zero usable events
// BINNED THE ONLY COPY. Storing was one way to prevent that; it is not the only way. Here THE BROWSER
// HOLDS THE FILE: the picked File stays in the client list, a failed or zero-event row is kept and
// marked, and re-running it re-reads the same File the user already has. The copy is never in one
// place only — it is on the admin's own device the whole time — so nothing is lost by not storing.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  buildScreenshotPrompt, parseScreenshotEvents, filterScreenshotEvents, toInboundEvents,
  type DroppedEvent,
} from '@/lib/admin/screenshot-events'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`

/**
 * Retry shape taken from the Apps Script (orig :645-661): retry ONLY on 429/503, back off, and give up
 * after a bounded number of attempts. ⚠️ Three attempts and a shorter backoff, not five and 15s+15s —
 * this runs inside a serverless request with a wall-clock limit, where the Apps Script had a 280s budget
 * and a 15s pacer between files. 🔴 A file that exhausts the retries is REPORTED, and its image is
 * already stored, so it can simply be uploaded again.
 */
async function callGemini(base64: string, mimeType: string, prompt: string): Promise<string> {
  const body = {
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  }
  let lastErr = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(GEMINI_URL('gemini-2.5-flash'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) {
      const json = await res.json()
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
      // The Apps Script throws its own message here (orig :667) because an empty candidate list is what a
      // safety-filter block looks like. Same distinction kept: "no events" and "refused to answer" differ.
      if (!text) throw new Error('Gemini returned no candidates — the image may have triggered a safety filter')
      return text
    }
    lastErr = `Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`
    if (res.status !== 429 && res.status !== 503) throw new Error(lastErr)
    await new Promise(r => setTimeout(r, attempt * 2000))
  }
  throw new Error(`${lastErr} (after 3 attempts)`)
}

type FileResult = {
  fileName: string
  extracted: number
  kept: number
  dropped: DroppedEvent[]
  written: number | null
  bridged: number | null
  error: string | null
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const form = await req.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files supplied' }, { status: 400 })
  }

  // 🔎 The GLOBAL exclusion list, read from discovery_exclusion_terms — the table the deployed
  // EXCLUSIONS_FROM switch reads. `term_key` is the pre-normalised value; comparing it with
  // normalizeVenue/venuesFuzzyMatch is the scraper's own rule. NOT the Sheet: this surface has no Sheet
  // dependency at all, which is half the point of moving off the Apps Script.
  // ⚠️ A read failure here is FATAL for the batch rather than silently proceeding with an empty set — an
  // empty exclusion list does not fail, it quietly admits quiz nights and TBC as trucks.
  const { data: termRows, error: termErr } = await supabase
    .from('discovery_exclusion_terms').select('term_key').limit(10000)
  if (termErr) {
    return NextResponse.json(
      { error: `Could not read discovery_exclusion_terms: ${termErr.message}. Refusing to extract without the exclusion set.` },
      { status: 500 },
    )
  }
  const termKeys = (termRows ?? []).map(r => r.term_key).filter(Boolean) as string[]

  const prompt = buildScreenshotPrompt(new Date())
  const results: FileResult[] = []

  for (const file of files) {
    const result: FileResult = {
      fileName: file.name, extracted: 0, kept: 0, dropped: [],
      written: null, bridged: null, error: null,
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer())

      // ── 1. Extract. The buffer is local to this request and is not written anywhere. ─────────────
      const raw = await callGemini(buffer.toString('base64'), file.type || 'image/jpeg', prompt)
      const parsed = parseScreenshotEvents(raw)
      result.extracted = parsed.length

      // ── 2. Filter — every drop carries its reason ─────────────────────────────────────────────────
      const { kept, dropped } = filterScreenshotEvents(parsed, termKeys)
      result.kept = kept.length
      result.dropped = dropped

      // ── 3. Write THROUGH /api/inbound-schedule, never straight to discovery_events ────────────────
      // 🧪 426 of 511 Drive rows carry a venue_id against 1,133 of 2,952 scraper rows, because this route
      // runs findVenue at insert and the scraper's own mirror does not. Same reason the Apps Script POSTs
      // here. ⚠️ Self-HTTP rather than extracting the route's enrichment into a lib: four producers
      // already depend on that route and none can be integration-tested from here.
      if (kept.length > 0) {
        const origin = process.env.HATCHGRAB_API_URL || new URL(req.url).origin
        const res = await fetch(`${origin}/api/inbound-schedule`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: process.env.INBOUND_SCHEDULE_SECRET,
            events: toInboundEvents(kept, file.name),
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(`inbound-schedule returned ${res.status}: ${body?.error ?? ''}`)
        result.written = body?.inserted ?? null
        result.bridged = body?.bridged ?? null
      } else {
        result.written = 0
      }
    } catch (err: any) {
      // 🔴 A THROW IS REPORTED, NOT SWALLOWED, and the batch continues to the next file. The browser
      // still holds this File, so the row stays in the client list marked failed and can be re-run.
      result.error = [result.error, err?.message ?? String(err)].filter(Boolean).join(' · ')
    }
    results.push(result)
  }

  return NextResponse.json({ ok: true, results })
}
