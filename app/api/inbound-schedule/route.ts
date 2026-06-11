import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendConfirmationEmail } from '@/lib/email'
import { normalizeVenue, venuesFuzzyMatch } from '@/lib/venue-signature'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const INBOUND_SECRET = process.env.INBOUND_SCHEDULE_SECRET

function toISODate(ddmmyyyy: string): string | null {
  if (!ddmmyyyy) return null
  const parts = String(ddmmyyyy).split('/')
  if (parts.length !== 3) return null
  let y = parseInt(parts[2])
  if (y < 100) y += 2000
  return `${y}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { secret, events } = body

  if (!INBOUND_SECRET || secret !== INBOUND_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'No events provided' }, { status: 400 })
  }

  const rows = events
    .map((e: any) => ({
      event_date: toISODate(e.event_date),
      start_time: e.start_time || null,
      end_time: e.end_time || null,
      truck_name: e.truck_name || '',
      venue_name: e.venue_name || null,
      village: e.village || null,
      postcode: e.postcode || null,
      event_notes: e.event_notes || null,
      source: e.source || null,
      ai_notes: e.ai_notes || null,
    }))
    .filter(r => r.event_date && r.truck_name)

  // Fetch lookup tables once for ID resolution. Venues carry coords + postcode so the bridge can
  // fall back to a fuzzy-matched venue's postcode/coords without a second (stricter) query.
  const [{ data: allDiscoveryTrucks }, { data: allVenues }] = await Promise.all([
    supabase.from('discovery_trucks').select('id, name'),
    supabase.from('venues').select('id, name, village, latitude, longitude, postcode'),
  ])

  // ── Venue matcher: token-overlap candidates → village-rank → ambiguity-BAIL ──────────────────────
  // Used for BOTH venue_id resolution and the postcode/coords fallback (single source of truth, so a
  // bail = no venue AND no postcode/coords — never a half-linked event). Replaces the old loose
  // substring match that linked "The Cavendish Five Bells" to the Rattlesden "Five Bells".
  //
  // 1) CANDIDATES by token containment (drop stopwords): a venue is a candidate if its significant
  //    tokens ⊆ the scraped tokens OR vice-versa (handles "Five Bells" ⊂ "Cavendish Five Bells" AND
  //    "Platform One" ⊂ "Platform One, Clare Castle Country Park"), or an exact normalized-name match.
  // 2) RANK by village agreement (normalized): event village == candidate village, OR the candidate's
  //    village tokens all appear in the scraped name (the embedded-town signal — fixes Cavendish even
  //    when the scraper left town null). Exactly one agreeing candidate → link it.
  // 3) BAIL: ≥2 candidates with no village agreement (village null/blank or non-matching) → return
  //    null. Blank-recoverable (operator fills it in) beats confident-wrong on the live site.
  const STOP = new Set(['the', 'pub', 'inn', 'tavern', 'arms', 'bar', 'hotel', 'and', 'at', 'on', 'of'])
  const toks = (s: string | null): string[] =>
    (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t))

  const findVenue = (venueName: string | null, village: string | null) => {
    if (!allVenues || !venueName) return null
    const sTok = new Set(toks(venueName))
    const normScraped = normName(venueName)

    // 1) Candidates
    const cands = (allVenues as any[]).filter(v => {
      if (normName(v.name) === normScraped) return true
      const vTok = new Set(toks(v.name))
      if (vTok.size === 0 || sTok.size === 0) return false
      const vSubS = [...vTok].every(t => sTok.has(t))   // venue name ⊆ scraped (e.g. "Five Bells")
      const sSubV = [...sTok].every(t => vTok.has(t))   // scraped ⊆ venue name (e.g. "Platform One")
      return vSubS || sSubV
    })
    if (cands.length === 0) return null
    if (cands.length === 1) return cands[0]

    // 2) Rank by village agreement. Primary: event village vs candidate village by token-subset in
    //    EITHER direction, so "Clare" agrees with "Clare Castle Country Park" (specificity differs).
    const evVilToks = toks(village)
    let agree = evVilToks.length
      ? cands.filter(c => {
          const cvT = toks(c.village)
          return cvT.length > 0 && (cvT.every(t => evVilToks.includes(t)) || evVilToks.every(t => cvT.includes(t)))
        })
      : []
    // Fallback: candidate's village tokens all appear in the scraped name (embedded-town signal).
    if (agree.length === 0) {
      agree = cands.filter(c => {
        const cv = toks(c.village)
        return cv.length > 0 && cv.every(t => sTok.has(t))
      })
    }
    if (agree.length === 1) return agree[0]
    if (agree.length > 1) {
      // Several candidates in the agreeing village — prefer an exact name match, else BAIL (ambiguous).
      return agree.find(c => normName(c.name) === normScraped) || null
    }
    // 3) ≥2 candidates, none agree on village → BAIL (no venue, no postcode/coords).
    return null
  }

  // Enrich each row with resolved IDs before upserting
  const enrichedRows = rows.map(row => {
    // Match discovery_truck_id
    let discoveryTruckId: string | null = null
    if (allDiscoveryTrucks) {
      const normIncoming = normName(row.truck_name)
      const match = allDiscoveryTrucks.find(t => {
        const normDb = normName(t.name)
        return normDb === normIncoming || normDb.includes(normIncoming) || normIncoming.includes(normDb)
      })
      if (match) discoveryTruckId = match.id
    }

    // Match venue_id (same fuzzy matcher as the postcode/coords fallback below)
    const venueId: string | null = findVenue(row.venue_name, row.village)?.id ?? null

    // Strip postcode: it belongs on truck_events only (the bridge insert reads row.postcode from
    // `rows`). discovery_events has no postcode column — leaving it in would 500 the upsert (PGRST204).
    const { postcode, ...discoveryRow } = row
    return {
      ...discoveryRow,
      visibility: 'public',
      discovery_truck_id: discoveryTruckId,
      venue_id: venueId,
    }
  })

  const { error } = await supabase
    .from('discovery_events')
    .upsert(enrichedRows, {
      onConflict: 'event_date,truck_name,venue_name',
      ignoreDuplicates: false
    })

  if (error) {
    console.error('Inbound schedule write failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Bridge: promote events to truck_events for linked HatchGrab trucks ──
  // Fetch all discovery_trucks that have a hatchgrab_truck_id once, then match locally
  const { data: linkedTrucks } = await supabase
    .from('discovery_trucks')
    .select('hatchgrab_truck_id, name')
    .not('hatchgrab_truck_id', 'is', null)

  let bridgedCount = 0
  const notifiedTruckIds = new Set<string>()

  for (const row of rows) {
    if (!row.truck_name) continue

    // Normalised match: exact, or one name contains the other
    const normIncoming = normName(row.truck_name)
    const matched = (linkedTrucks || []).find(t => {
      const normDb = normName(t.name)
      return normDb === normIncoming ||
        normDb.includes(normIncoming) ||
        normIncoming.includes(normDb)
    })
    if (!matched?.hatchgrab_truck_id) continue
    const truckId = matched.hatchgrab_truck_id

    // Preference gate: skip truck_events write for manual-only trucks
    const { data: truckPref } = await supabase
      .from('trucks')
      .select('scraper_preference')
      .eq('id', truckId)
      .single()
    if (truckPref?.scraper_preference === 'manual') continue

    const incomingVenue = normalizeVenue(row.venue_name || '')

    // Reject-memory (Stage 3): skip events the operator previously rejected. Checked FIRST and
    // independent of any truck_events row, so a rejected-then-deleted event stays gone. Same
    // signature match (truck_id + event_date + fuzzy venue) reusing lib/venue-signature.
    const { data: suppressed } = await supabase
      .from('rejected_event_signatures')
      .select('scraped_signature')
      .eq('truck_id', truckId)
      .eq('event_date', row.event_date!)
    const isSuppressed = (suppressed || []).some(s =>
      venuesFuzzyMatch(normalizeVenue(s.scraped_signature), incomingVenue)
    )
    if (isSuppressed) continue

    // Dedup against the IMMUTABLE scraped_signature (Stage 2): fetch this truck's events on this
    // date (date is exact + not editable, so it stays the scraped original), then fuzzy-match the
    // incoming venue against each row's scraped_signature. This survives edits — an operator
    // renaming the venue ("Fardons"→"Farndons") doesn't change scraped_signature, so a re-scrape of
    // the original still matches and isn't re-surfaced. Falls back to venue_name for legacy rows
    // with no signature yet (backward-compatible — same as the old venue_name dedup).
    const { data: sameDay } = await supabase
      .from('truck_events')
      .select('id, venue_name, scraped_signature')
      .eq('truck_id', truckId)
      .eq('event_date', row.event_date!)
    const isDup = (sameDay || []).some(r =>
      venuesFuzzyMatch(normalizeVenue(r.scraped_signature || r.venue_name || ''), incomingVenue)
    )
    if (isDup) continue

    // Look up venue coordinates + postcode from the FUZZY-matched venue (same matcher as venue_id
    // resolution above), so name variants resolve. postcode falls back to the venue's when the page
    // omitted it. No second DB query — reuses the once-fetched allVenues.
    let latitude: number | null = null
    let longitude: number | null = null
    let venuePostcode: string | null = null
    const matchedVenue = findVenue(row.venue_name, row.village)
    if (matchedVenue) {
      latitude = matchedVenue.latitude
      longitude = matchedVenue.longitude
      venuePostcode = matchedVenue.postcode ?? null
    }

    const { data: insertedEvent, error: insertErr } = await supabase.from('truck_events').insert({
      truck_id:   truckId,
      venue_name: row.venue_name || null,
      town:       row.village || null,
      // Scraped postcode first; fall back to the matched venue's postcode; null if neither.
      postcode:   row.postcode || venuePostcode || null,
      event_date: row.event_date,
      start_time: row.start_time || null,
      end_time:   row.end_time || null,
      notes:      row.event_notes || null,
      status:     'unconfirmed',
      source:     'scraper',
      // Immutable as-scraped venue — set ONCE here, never touched by events/action update.
      scraped_signature: row.venue_name || null,
      latitude,
      longitude,
    }).select('id').single()
    if (insertErr) {
      console.error('[inbound-schedule] bridge insert failed:', insertErr.message)
      continue
    }
    bridgedCount++
    // Per-event stock is sparse-override (rows created only on a dashboard edit) — no snapshot at
    // creation. insertedEvent.id is captured for future per-event use (Phase 4/5).
    void insertedEvent

    // Best-effort notification — once per truck per batch, with event list
    if (!notifiedTruckIds.has(truckId)) {
      notifiedTruckIds.add(truckId)
      // Collect events for this truck for the email (gathered below after loop)
    }
  }

  // Send one notification email per truck that had new events bridged. AWAITED (Promise.all) so
  // the sends complete before the handler returns — on serverless (Vercel) an unawaited promise
  // can be killed when the response is sent, so a fire-and-forget IIFE never actually emailed.
  // Per-send try/catch keeps one truck's failure from breaking the others (events still bridged).
  await Promise.all([...notifiedTruckIds].map(async (truckId) => {
      try {
        const { data: truck } = await supabase
          .from('trucks')
          .select('contact_email, name, dashboard_token')
          .eq('id', truckId)
          .single()
        if (!truck?.contact_email) return

        // Fetch the new unconfirmed events just written for this truck
        const { data: newEvents } = await supabase
          .from('truck_events')
          .select('event_date, venue_name, town, start_time, end_time')
          .eq('truck_id', truckId)
          .eq('status', 'unconfirmed')
          .eq('source', 'scraper')
          .gte('event_date', new Date().toISOString().slice(0, 10))
          .order('event_date', { ascending: true })
          .limit(20)

        const n = (newEvents || []).length
        const manageUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/manage/${truck.dashboard_token}?tab=schedule`

        const fmtDate = (iso: string) => {
          const d = new Date(iso + 'T00:00:00')
          return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        }
        // start–end as HH:MM; omit cleanly if either is missing.
        const fmtTimeRange = (st?: string | null, et?: string | null) => {
          const a = st ? String(st).slice(0, 5) : ''
          const b = et ? String(et).slice(0, 5) : ''
          return a && b ? `${a}–${b}` : a || ''
        }
        const headLine = (e: any) => {
          const t = fmtTimeRange(e.start_time, e.end_time)
          return `${fmtDate(e.event_date)}${t ? ` · ${t}` : ''}`           // "Thu 11 Jun · 17:00–20:00"
        }
        const venueLine = (e: any) => `${e.venue_name || 'Unknown venue'}${e.town ? `, ${e.town}` : ''}`

        // Stacked rows (NOT a table / multi-column) — each event is two stacked text lines with a
        // light divider, so it reflows cleanly on mobile + Outlook/hotmail. Inline CSS only.
        const eventListHtml = (newEvents || []).map(e =>
          `<div style="padding:10px 0;border-bottom:1px solid #eef2f6">
            <div style="font-weight:bold;color:#1e293b;font-size:15px;line-height:1.3">${headLine(e)}</div>
            <div style="color:#475569;font-size:14px;line-height:1.4;margin-top:3px">${venueLine(e)}</div>
          </div>`
        ).join('')

        const eventListText = (newEvents || []).map(e =>
          `  - ${headLine(e)}\n    ${venueLine(e)}`
        ).join('\n')

        await sendConfirmationEmail({
          to: truck.contact_email,
          subject: `New events found for ${truck.name} — please review`,
          html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#334155">
            <p>Hi there,</p>
            <p>We found <strong>${n} new event${n !== 1 ? 's' : ''}</strong> on your schedule that need your approval before they appear to customers.</p>
            <p style="margin:24px 0">
              <a href="${manageUrl}" style="background:#ea580c;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">
                Review your schedule →
              </a>
            </p>
            <p style="font-weight:600;margin-bottom:6px">Events found:</p>
            <div style="border-top:1px solid #eef2f6">${eventListHtml}</div>
            <p style="margin-top:16px">Once you approve them in your Schedule tab they'll go live on the map and your ordering page will be ready to take pre-orders.</p>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px">— The HatchGrab team · hatchgrab.com</p>
          </div>`,
          text: `Hi there,\n\nWe found ${n} new event${n !== 1 ? 's' : ''} on your schedule that need your approval:\n\n${eventListText}\n\nReview them at: ${manageUrl}\n\nOnce you approve them they'll go live on the map.\n\n— The HatchGrab team`,
          senderName: 'HatchGrab',
          truckName: truck.name,
        })
      } catch (err) {
        console.error(`[inbound-schedule] notification failed for truck ${truckId}:`, err)
      }
  }))

  console.log(`[inbound-schedule] wrote ${rows.length} discovery rows, bridged ${bridgedCount} to truck_events`)
  return NextResponse.json({ ok: true, inserted: rows.length, bridged: bridgedCount })
}
