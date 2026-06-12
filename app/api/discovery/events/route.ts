import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSlug } from '@/lib/utils'
import { isHatchGrabHost } from '@/lib/brand'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 300

function formatImageUrl(rawPath: string | null, defaultFolder: string): string {
  if (!rawPath) return ''
  const cleanPath = rawPath.trim()
  if (cleanPath.startsWith('http') || cleanPath.startsWith('/')) return cleanPath
  return `/${defaultFolder}/${cleanPath}`
}

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
  visibility,
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
    exclude_reason,
    visibility
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

const TR_SELECT = 'name, cuisine, phone, order_url, accepted_methods, notes, website, menu_url, logo_url, photo_url, aliases, exclude_reason, visibility'

export async function GET(req: NextRequest) {
  const today = new Date().toISOString().split('T')[0]
  const slug = req.nextUrl.searchParams.get('slug')

  const host = req.headers.get('host') || ''
  const isHG = isHatchGrabHost(host)
  // public = both sites, hg_only = HatchGrab only, hidden = neither
  const allowedVisibility = isHG ? ['public', 'hg_only'] : ['public']

  let evData: any[] = []
  let trData: any[] = []

  try {
    const [evResult, trResult] = await Promise.all([
      supabase
        .from('discovery_events')
        .select(EV_SELECT)
        .in('visibility', allowedVisibility)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false })
        .limit(1000),

      supabase
        .from('discovery_trucks')
        .select(TR_SELECT)
        .in('visibility', allowedVisibility)
        .order('name'),
    ])

    if (evResult.error || trResult.error) {
      throw evResult.error || trResult.error
    }

    evData = evResult.data || []
    trData = trResult.data || []
  } catch (err) {
    console.error('[Discovery] Query failed, falling back to no visibility filter:', err)

    const [evResult, trResult] = await Promise.all([
      supabase
        .from('discovery_events')
        .select(EV_SELECT)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false })
        .limit(1000),

      supabase
        .from('discovery_trucks')
        .select(TR_SELECT)
        .order('name'),
    ])

    if (evResult.error) {
      console.error('[Discovery] Fallback events query failed:', evResult.error.message)
      return NextResponse.json({ error: evResult.error.message }, { status: 500 })
    }
    if (trResult.error) {
      console.error('[Discovery] Fallback trucks query failed:', trResult.error.message)
      return NextResponse.json({ error: trResult.error.message }, { status: 500 })
    }

    evData = evResult.data || []
    trData = trResult.data || []
  }

  // ── Map discovery events ───────────────────────────────────────
  const mappedDiscoveryEvents = evData.map((e: any, idx: number) => {
    const truck = e.discovery_trucks || {}
    const venue = e.venues || {}

    if (truck.name && (truck.exclude_reason || '').toLowerCase().includes('y')) return null

    // Filter by truck-level visibility (in case the event passed but its truck didn't)
    const truckVis = truck.visibility || 'public'
    if (!allowedVisibility.includes(truckVis)) return null

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

  // Visibility map for gating operator events: operator truck (trucks.id) → its linked
  // discovery_trucks.visibility (via hatchgrab_truck_id). Fetched UNFILTERED on purpose — we must see
  // hg_only/hidden rows to EXCLUDE them on villagefoodie. (trData above is visibility-filtered, so an
  // hg_only row would be missing there and wrongly default to 'public' → leak.) Operator trucks with
  // no linked discovery row default to 'public' (shown on both sites — no regression for real trucks).
  const { data: linkRows } = await supabase
    .from('discovery_trucks')
    .select('hatchgrab_truck_id, visibility')
    .not('hatchgrab_truck_id', 'is', null)
  const linkedVisibilityByTruckId = new Map<string, string>(
    (linkRows || []).map((r: any) => [r.hatchgrab_truck_id, r.visibility || 'public'])
  )

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
          active
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
          // Gate operator events by the linked discovery truck's visibility — SAME rule as the
          // discovery-events path. No link → 'public' (both sites); 'hg_only' → HatchGrab only;
          // 'hidden' → neither. Replaces the old is_test drop (is_test column doesn't exist in prod).
          const linkedVis = linkedVisibilityByTruckId.get(truck.id) ?? 'public'
          if (!allowedVisibility.includes(linkedVis)) return false
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
      !(t.exclude_reason || '').toLowerCase().includes('y') &&
      allowedVisibility.includes(t.visibility || 'public')
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
