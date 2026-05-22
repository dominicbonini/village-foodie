import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSlug } from '@/lib/utils'

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

export async function GET() {
  const today = new Date().toISOString().split('T')[0]

  const [evResult, trResult] = await Promise.all([
    supabase
      .from('discovery_events')
      .select(`
        id,
        event_date,
        start_time,
        end_time,
        truck_name,
        venue_name,
        village,
        event_notes,
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
          exclude_reason
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
      `)
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false })
      .limit(1000),
    supabase
      .from('discovery_trucks')
      .select('name, cuisine, phone, order_url, accepted_methods, notes, website, menu_url, logo_url, photo_url, aliases, exclude_reason')
      .order('name'),
  ])

  if (evResult.error) {
    console.error('Discovery events error:', evResult.error.message)
    return NextResponse.json({ error: evResult.error.message }, { status: 500 })
  }
  if (trResult.error) {
    console.error('Discovery trucks error:', trResult.error.message)
    return NextResponse.json({ error: trResult.error.message }, { status: 500 })
  }

  const events = (evResult.data || []).map((e: any, idx: number) => {
    const truck = e.discovery_trucks || {}
    const venue = e.venues || {}

    // Skip events for trucks explicitly excluded
    if (truck.name && (truck.exclude_reason || '').toLowerCase().includes('y')) return null

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
    }
  }).filter(Boolean)

  const trucks = (trResult.data || [])
    .filter((t: any) => !(t.exclude_reason || '').toLowerCase().includes('y'))
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

  return NextResponse.json({ events, trucks })
}
