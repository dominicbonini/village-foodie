import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendConfirmationEmail } from '@/lib/email'
import { normalizeVenue, venuesFuzzyMatch } from '@/lib/venue-signature'
import { findVenue, normName, type VenueRow } from '@/lib/venue-matcher'
import { getVanOrderReadyDefault } from '@/lib/van-utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CALL-SITE venue-name dedup: the byte-mirrored primitive `venuesFuzzyMatch` (lib/venue-signature.ts, kept
// IDENTICAL to run-scraper.js's isFuzzyMatch — anti-drift invariant) PLUS containment, composed HERE not in
// the primitive. Mirrors the existing run-scraper.js pattern (:771/827) `isFuzzyMatch(a,b) || a.includes(b)
// || b.includes(a)`, but ADDS a MIN length-gate the scraper's bare .includes lacks — so a short generic
// token ("bell") can't be a substring of an unrelated venue (§25 substring caution). Used ONLY by the dedup
// FALLBACK (when venue_id can't be the key); NOT by reject-memory (that stays strict Lev-1 — a suppression
// false-positive silently loses a real event, so it must not loosen).
const DEDUP_CONTAINMENT_MIN = 5
function venueNameDedupMatch(a: string, b: string): boolean {
  if (venuesFuzzyMatch(a, b)) return true
  return a.length >= DEDUP_CONTAINMENT_MIN && b.length >= DEDUP_CONTAINMENT_MIN && (a.includes(b) || b.includes(a))
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
  // fall back to the matched venue's postcode/coords without a second query.
  const [{ data: allDiscoveryTrucks }, { data: allVenuesRaw }] = await Promise.all([
    supabase.from('discovery_trucks').select('id, name'),
    supabase.from('venues').select('id, name, village, latitude, longitude, postcode'),
  ])
  // Shared venue matcher (lib/venue-matcher) takes allVenues as a param; pass once.
  const allVenues = (allVenuesRaw ?? []) as VenueRow[]

  // Resolve each row's venue ONCE (was called twice — discovery enrichment + truck_events coords).
  // Keyed by row reference; both passes below read from this map so the match (and its confidence)
  // is computed a single time per event.
  const venueMatchByRow = new Map(rows.map(r => [r, findVenue(r.venue_name, r.village, allVenues)]))

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
    const venueId: string | null = venueMatchByRow.get(row)?.venue?.id ?? null

    // Strip postcode: it belongs on truck_events only (the bridge insert reads row.postcode from
    // `rows`). discovery_events has no postcode column — leaving it in would 500 the upsert (PGRST204).
    const { postcode, ...discoveryRow } = row
    return {
      ...discoveryRow,
      visibility: 'public',
      show_on_vf: true,   // new scraped events default to both sites (mirrors visibility:'public')
      show_on_hg: true,
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
  // Per-truck cache of the order-ready default to seed onto each new scraped event (master-switch model —
  // new events start matching the Settings default). One van lookup per truck, not per row.
  const orderReadyDefaultCache = new Map<string, boolean | null>()

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
    // Resolve the incoming venue ONCE per row (precompute map) — reused by the dedup PRIMARY key below AND
    // the insert stamps further down (never resolved twice; Section 25 single-resolution rule).
    const venueMatch = venueMatchByRow.get(row) ?? { venue: null, confidence: 'none' as const }
    const incomingVenueId = venueMatch.venue?.id ?? null

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

    // Dedup (Stage 2): fetch this truck's events on this date (date is exact-equality — so the same venue
    // on a DIFFERENT date is never a dupe; recurring events stay distinct by construction), then decide
    // "already exists" by TWO complementary rules:
    //   PRIMARY  — (truck_id, event_date, venue_id) when BOTH resolve a venue_id. This survives the
    //              operator editing venue_name post-approval (the name changes, the venue_id doesn't), so a
    //              re-scrape of an approved-then-renamed event is still caught (Section 27 backlog :2675).
    //   FALLBACK — name match when either venue_id is null (e.g. venue not in the directory, like "Belchamp
    //              Community House"): venuesFuzzyMatch OR MIN-gated containment (venueNameDedupMatch), which
    //              recognises Gemini rephrasing the same venue ("Community House" vs "Belchamp Community
    //              House") while keeping different-prefix venues distinct (stambournevillagehall vs
    //              toppesfieldvillagehall — neither contains the other).
    // Name fallback compares against the IMMUTABLE scraped_signature (survives operator renames; falls back
    // to venue_name for legacy rows with no signature).
    const { data: sameDay } = await supabase
      .from('truck_events')
      .select('id, venue_name, scraped_signature, venue_id')
      .eq('truck_id', truckId)
      .eq('event_date', row.event_date!)
    const isDup = (sameDay || []).some(r => {
      if (incomingVenueId && r.venue_id && r.venue_id === incomingVenueId) return true   // PRIMARY: venue_id
      return venueNameDedupMatch(normalizeVenue(r.scraped_signature || r.venue_name || ''), incomingVenue)
    })
    if (isDup) continue

    // Reuse the single venue match resolved once per row above (coords + postcode + the anchor/
    // confidence stamps all come from the same VenueMatch — never resolved twice).
    const match = venueMatch
    const matchedVenue = match.venue
    const latitude: number | null = matchedVenue?.latitude ?? null
    const longitude: number | null = matchedVenue?.longitude ?? null
    const venuePostcode: string | null = matchedVenue?.postcode ?? null

    // Seed order_ready_override from the truck's order-ready default (cached per truck).
    if (!orderReadyDefaultCache.has(truckId)) {
      orderReadyDefaultCache.set(truckId, await getVanOrderReadyDefault(supabase, truckId))
    }
    const seededOrderReady = orderReadyDefaultCache.get(truckId)!

    const { data: insertedEvent, error: insertErr } = await supabase.from('truck_events').insert({
      truck_id:   truckId,
      order_ready_override: seededOrderReady,
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
      // Venue anchor + provenance/confidence (migration 20260612_truck_events_venue_id). 'scraper'
      // source = matcher best-effort guess (NOT operator-validated). 'none' confidence → NULL.
      venue_id:               matchedVenue?.id ?? null,
      venue_id_source:        matchedVenue ? 'scraper' : null,
      venue_match_confidence: matchedVenue ? match.confidence : null,
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
        const venueLine = (e: any) => `${e.venue_name || 'Unknown venue'}${e.town ? `, ${e.town}` : ''}`

        // Venue-first hierarchy: bold venue on line 1, date | time on line 2 with scannable emojis.
        // Each event is two stacked text lines separated by an <hr> — reflows cleanly on mobile +
        // Outlook/Gmail. Inline CSS only.
        // ANTI AUTO-LINK: Apple Mail / Gmail "data detectors" auto-wrap date & time strings in blue
        // calendar <a> links. Wrapping each value in our own <a> with forced dark colour +
        // text-decoration:none + pointer-events:none pre-empts that, so they render as plain text.
        const noLink = 'color:#1e293b !important;text-decoration:none !important;pointer-events:none;cursor:default'
        const eventBlockHtml = (e: any) => {
          const t = fmtTimeRange(e.start_time, e.end_time)
          const timePart = t
            ? ` <span style="color:#cbd5e1">|</span> <a style="${noLink}">⏱️ ${t}</a>`
            : ''
          return `<div style="padding:14px 0">
            <div style="font-weight:bold;color:#1e293b;font-size:16px;line-height:1.35">📍 ${venueLine(e)}</div>
            <div style="font-size:14px;line-height:1.5;margin-top:5px">
              <a style="${noLink}">📅 ${fmtDate(e.event_date)}</a>${timePart}
            </div>
          </div>`
        }
        // <hr> divider BETWEEN blocks (not after the last).
        const eventListHtml = (newEvents || []).map(eventBlockHtml)
          .join('<hr style="border:none;border-top:1px solid #eef2f6;margin:0" />')

        const eventListText = (newEvents || []).map(e => {
          const t = fmtTimeRange(e.start_time, e.end_time)
          return `  📍 ${venueLine(e)}\n  📅 ${fmtDate(e.event_date)}${t ? ` | ⏱️ ${t}` : ''}`
        }).join('\n\n')

        await sendConfirmationEmail({
          to: truck.contact_email,
          subject: `New events found for ${truck.name} — please review`,
          html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#334155">
            <p>Hi there,</p>
            <p>We found <strong>${n} new event${n !== 1 ? 's' : ''}</strong> on your schedule that need your approval before they appear to customers.</p>
            <p style="font-weight:600;margin:20px 0 0">Events found:</p>
            <div style="border-top:1px solid #eef2f6;border-bottom:1px solid #eef2f6">${eventListHtml}</div>
            <p style="margin-top:16px">Once you approve them in your Schedule tab they'll go live on the map and your ordering page will be ready to take pre-orders.</p>
            <p style="margin:24px 0 8px">
              <a href="${manageUrl}" style="background:#ea580c;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">
                Review your schedule →
              </a>
            </p>
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
