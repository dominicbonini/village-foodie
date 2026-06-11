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
      event_notes: e.event_notes || null,
      source: e.source || null,
      ai_notes: e.ai_notes || null,
    }))
    .filter(r => r.event_date && r.truck_name)

  // Fetch lookup tables once for ID resolution
  const [{ data: allDiscoveryTrucks }, { data: allVenues }] = await Promise.all([
    supabase.from('discovery_trucks').select('id, name'),
    supabase.from('venues').select('id, name, village'),
  ])

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

    // Match venue_id
    let venueId: string | null = null
    if (allVenues && row.venue_name) {
      const normVenue = normName(row.venue_name)
      const normVillage = normName(row.village || '')
      const match = allVenues.find(v => {
        const nameMatch = normName(v.name) === normVenue ||
                          normName(v.name).includes(normVenue) ||
                          normVenue.includes(normName(v.name))
        const villageMatch = !normVillage ||
                             normName(v.village || '') === normVillage ||
                             normName(v.village || '').includes(normVillage) ||
                             normVillage.includes(normName(v.village || ''))
        return nameMatch && villageMatch
      })
      if (match) venueId = match.id
    }

    return {
      ...row,
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
    const incomingVenue = normalizeVenue(row.venue_name || '')
    const isDup = (sameDay || []).some(r =>
      venuesFuzzyMatch(normalizeVenue(r.scraped_signature || r.venue_name || ''), incomingVenue)
    )
    if (isDup) continue

    // Look up venue coordinates
    let latitude: number | null = null
    let longitude: number | null = null
    if (row.venue_name) {
      const { data: venue } = await supabase
        .from('venues')
        .select('latitude, longitude')
        .ilike('name', row.venue_name)
        .maybeSingle()
      if (venue) {
        latitude = venue.latitude
        longitude = venue.longitude
      }
    }

    const { error: insertErr } = await supabase.from('truck_events').insert({
      truck_id:   truckId,
      venue_name: row.venue_name || null,
      town:       row.village || null,
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
    })
    if (insertErr) {
      console.error('[inbound-schedule] bridge insert failed:', insertErr.message)
      continue
    }
    bridgedCount++

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
          .select('event_date, venue_name, town')
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

        const eventListHtml = (newEvents || []).map(e =>
          `<li style="padding:3px 0;color:#475569">${fmtDate(e.event_date)} — ${e.venue_name || 'Unknown venue'}${e.town ? `, ${e.town}` : ''}</li>`
        ).join('')

        const eventListText = (newEvents || []).map(e =>
          `  - ${fmtDate(e.event_date)} — ${e.venue_name || 'Unknown venue'}${e.town ? `, ${e.town}` : ''}`
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
            <ul style="margin:0;padding-left:16px">${eventListHtml}</ul>
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
