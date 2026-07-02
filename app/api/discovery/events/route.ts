import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSlug } from '@/lib/utils'
import { isHatchGrabHost } from '@/lib/brand'
import { formatImageUrl } from '@/lib/image-utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 300

function toddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

// Convert DD/MM/YYYY back to YYYY-MM-DD for correct chronological string sort
function toIso(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/')
  return `${y}-${m}-${d}`
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const EV_SELECT = `
  id,
  event_date,
  start_time,
  end_time,
  truck_name,
  venue_name,
  village,
  event_notes,
  discovery_truck_id,
  show_on_vf,
  show_on_hg,
  discovery_trucks!discovery_truck_id (
    name,
    cuisine,
    phone,
    order_url,
    accepted_methods,
    notes,
    website,
    menu_url,
    logo_url,
    photo_url,
    aliases,
    excluded,
    show_on_vf,
    show_on_hg
  ),
  venues!venue_id (
    name,
    village,
    postcode,
    latitude,
    longitude,
    phone,
    website,
    photo_url
  )
`

const TR_SELECT = 'name, cuisine, phone, order_url, accepted_methods, notes, website, menu_url, logo_url, photo_url, aliases, exclude_reason, excluded, show_on_vf, show_on_hg'

export async function GET(req: NextRequest) {
  const today = new Date().toISOString().split('T')[0]
  const slug = req.nextUrl.searchParams.get('slug')

  const host = req.headers.get('host') || ''
  const isHG = isHatchGrabHost(host)
  // Per-site boolean: HatchGrab reads show_on_hg, Village Foodie reads show_on_vf.
  const showCol = isHG ? 'show_on_hg' : 'show_on_vf'

  let evData: any[] = []
  let trData: any[] = []

  try {
    const [evResult, trResult] = await Promise.all([
      supabase
        .from('discovery_events')
        .select(EV_SELECT)
        .eq(showCol, true)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false })
        .limit(1000),

      supabase
        .from('discovery_trucks')
        .select(TR_SELECT)
        .eq(showCol, true)
        .order('name'),
    ])

    if (evResult.error || trResult.error) {
      throw evResult.error || trResult.error
    }

    evData = evResult.data || []
    trData = trResult.data || []
  } catch (err) {
    // FAIL CLOSED: on error we drop the scraped-discovery feed entirely rather than fall back to an
    // UNFILTERED query — the old fallback could leak hg_only/hidden rows onto the public Village Foodie
    // site. Operator events are computed separately below and are unaffected by this.
    console.error('[Discovery] Scraped-discovery query failed — failing closed (empty):', err)
    evData = []
    trData = []
  }

  // Suppression is now AUTOMATIC via `excluded`: a graduated truck's scraped shadow is excluded=true, so the
  // ordinary truck-level gate below drops all its events (no is_customer join, no hatchgrab_truck_id link).

  // ── Map discovery events ───────────────────────────────────────
  const mappedDiscoveryEvents = evData.map((e: any, idx: number) => {
    const truck = e.discovery_trucks || {}
    const venue = e.venues || {}

    // Master hide (replaces the old exclude_reason ~ 'y' filter) — also how a graduated truck's scraped
    // shadow is suppressed.
    if (truck.excluded) return null

    // Truck-level gate (in case the event row passed but its truck is not shown on this site).
    if (!truck[showCol]) return null

    const truckSlug = createSlug(truck.name || e.truck_name || '')
    if (slug && truckSlug !== slug) return null

    return {
      id: `event-${idx}`,
      date: toddmmyyyy(e.event_date),
      startTime: e.start_time || '',
      endTime: e.end_time || '',
      truckName: truck.name || e.truck_name,
      venueName: e.venue_name || '',
      village: e.village || venue.village || '',
      postcode: venue.postcode || '',
      venueLat: venue.latitude ? parseFloat(String(venue.latitude)) : undefined,
      venueLong: venue.longitude ? parseFloat(String(venue.longitude)) : undefined,
      venuePhone: venue.phone || '',
      venueWebsite: venue.website || '',
      venuePhoto: formatImageUrl(venue.photo_url || null, 'photos'),
      type: truck.cuisine || '',
      phoneNumber: truck.phone || '',
      orderUrl: truck.order_url || '',
      acceptedMethods: truck.accepted_methods || '',
      websiteUrl: truck.website || '',
      menuUrl: truck.menu_url || '',
      notes: truck.notes || '',
      eventNotes: e.event_notes || '',
      logoUrl: formatImageUrl(truck.logo_url || null, 'logos'),
      foodPhotoUrl: formatImageUrl(truck.photo_url || null, 'photos'),
      source: 'discovery' as const,
    }
  }).filter(Boolean)

  // ── Operator events (additive — failure must never break discovery map) ──
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

  // Operator-event visibility is now read DIRECTLY off the truck's own NOT-NULL show_on_vf/show_on_hg —
  // no more "linked discovery_trucks.visibility, default public if unlinked" (that missing-link default was
  // the leak the audit flagged). order_link_vf/order_link_hg drive the per-site Order CTA in the listing.
  let mappedOperatorEvents: any[] = []
  try {
    const opResult = await supabase
      .from('truck_events')
      .select(`
        id,
        event_date,
        start_time,
        end_time,
        venue_name,
        town,
        postcode,
        latitude,
        longitude,
        notes,
        status,
        trucks!truck_id (
          id,
          name,
          cuisine_type,
          logo_storage_path,
          slug,
          active,
          excluded,
          show_on_vf,
          show_on_hg,
          order_link_vf,
          order_link_hg
        )
      `)
      .in('status', ['confirmed', 'open'])
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(200)

    if (opResult.error) {
      console.error('[Discovery] Operator events query failed:', opResult.error.message)
    } else {
      mappedOperatorEvents = (opResult.data || [])
        .filter((e: any) => {
          const truck = e.trucks as any
          if (!truck) return false
          if (!truck.active) return false
          if (truck.excluded) return false   // master hide
          // Gate by the truck's OWN per-site boolean (NOT NULL, no missing-link default → no leak).
          if (!truck[showCol]) return false
          if (slug && createSlug(truck.name || '') !== slug) return false
          return true
        })
        .map((e: any) => {
          const truck = e.trucks as any
          return {
            id: e.id,
            date: toddmmyyyy(e.event_date),
            startTime: e.start_time || '',
            endTime: e.end_time || '',
            truckName: truck?.name || '',
            venueName: e.venue_name || '',
            status: e.status, // 'open' = LIVE (operator-started); 'confirmed' = Pre-order
            village: e.town || '',
            postcode: e.postcode || '',
            venueLat: e.latitude ? parseFloat(String(e.latitude)) : undefined,
            venueLong: e.longitude ? parseFloat(String(e.longitude)) : undefined,
            venuePhone: null,
            venueWebsite: null,
            venuePhoto: null,
            type: truck?.cuisine_type || '',
            phoneNumber: null,
            orderUrl: truck?.slug ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order` : null,
            // Per-site order-link flags — the listing gates the Order CTA on these (HG=order_link_hg,
            // VF=order_link_vf). Defaults preserve today: HG on, VF off.
            orderLinkVf: truck?.order_link_vf ?? false,
            orderLinkHg: truck?.order_link_hg ?? true,
            acceptedMethods: null,
            websiteUrl: null,
            menuUrl: null,
            notes: e.notes || '',
            eventNotes: '',
            logoUrl: truck?.logo_storage_path
              ? `${supabaseUrl}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
              : '',
            foodPhotoUrl: '',
            source: 'operator' as const,
          }
        })
    }
  } catch (err) {
    console.error('[Discovery] Operator events query failed:', err)
    // Fall through with empty array — existing discovery events unaffected
  }

  const visibleOperatorEvents = mappedOperatorEvents

  // ── Dedup: operator version wins ──────────────────────────────
  const operatorKeys = new Set(
    visibleOperatorEvents.map((e: any) =>
      `${normalize(e.truckName)}-${e.date}-${normalize(e.venueName)}`
    )
  )

  // TEMPORARY (trial): HatchGrab shows operator/approved events only; scraped discovery events are Village-Foodie-only.
  // To be replaced by the per-truck customer-mode state machine (discovery → preview → live).
  const filteredDiscovery = isHG ? [] : (mappedDiscoveryEvents as any[]).filter(e =>
    !operatorKeys.has(`${normalize(e.truckName)}-${e.date}-${normalize(e.venueName)}`)
  )

  // ── Merge and sort chronologically ────────────────────────────
  const allEvents = [...visibleOperatorEvents, ...filteredDiscovery]
    .sort((a: any, b: any) => {
      const da = toIso(a.date), db = toIso(b.date)
      if (da < db) return -1
      if (da > db) return 1
      return (a.startTime || '').localeCompare(b.startTime || '')
    })

  // ── Trucks list (discovery only) ─────────────────────────────
  const trucks = trData
    .filter((t: any) =>
      !t.excluded &&
      t[showCol] === true
    )
    .map((t: any) => ({
      rawName: t.name,
      cleanKey: createSlug(t.name),
      type: t.cuisine || '',
      phoneNumber: t.phone || '',
      orderUrl: t.order_url || '',
      acceptedMethods: t.accepted_methods || '',
      truckNotes: t.notes || '',
      websiteUrl: t.website || '',
      menuUrl: t.menu_url || '',
      logoUrl: formatImageUrl(t.logo_url, 'logos'),
      foodPhotoUrl: formatImageUrl(t.photo_url, 'photos'),
      aliases: Array.isArray(t.aliases) ? t.aliases.join(',') : (t.aliases || ''),
      exclude: t.exclude_reason || '',
    }))

  return NextResponse.json({ events: allEvents, trucks })
}
