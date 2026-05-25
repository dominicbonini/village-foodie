// app/api/events/route.ts
// Returns upcoming events for a given truck slug.
// Called by the order page and AddOrderPanel.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSlug } from '@/lib/utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 300

function toddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

function formatFriendly(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const check = new Date(date); check.setHours(0, 0, 0, 0)
  const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' })
  const day = date.getDate()
  const suffix = [11, 12, 13].includes(day) ? 'th' : (['st', 'nd', 'rd'][(day % 10) - 1] || 'th')
  const month = date.toLocaleDateString('en-GB', { month: 'long' })
  const base = `${dayName} ${day}${suffix} ${month}`
  if (check.getTime() === today.getTime()) return `Today — ${base}`
  if (check.getTime() === tomorrow.getTime()) return `Tomorrow — ${base}`
  return base
}

export async function GET(req: NextRequest) {
  const truckSlug = req.nextUrl.searchParams.get('truck')
  if (!truckSlug) {
    return NextResponse.json({ error: 'truck param required' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  // Build alias map from all discovery trucks.
  // Test trucks (is_test=true) have no discovery_trucks / discovery_events entries,
  // so they're naturally excluded from customer-facing results.
  const { data: trucks } = await supabase
    .from('discovery_trucks')
    .select('name, aliases')

  const aliasMap: Record<string, string> = {}
  ;(trucks || []).forEach((t: any) => {
    aliasMap[createSlug(t.name)] = t.name
    ;(t.aliases || []).forEach((a: string) => {
      const s = createSlug(a.trim())
      if (s) aliasMap[s] = t.name
    })
  })

  const canonicalName = aliasMap[truckSlug]

  if (!canonicalName) {
    return NextResponse.json({
      truck_slug: truckSlug,
      truck_name: truckSlug,
      events: [],
      next_event: null,
    })
  }

  const { data: rows, error } = await supabase
    .from('discovery_events')
    .select('event_date, start_time, end_time, truck_name, venue_name, village, event_notes')
    .eq('truck_name', canonicalName)
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(50)

  if (error) {
    console.error('Events API error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const seen = new Set<string>()
  const events = (rows || []).map(e => {
    const key = `${e.event_date}|${createSlug(e.venue_name || '')}|${createSlug(e.village || '')}`
    if (seen.has(key)) return null
    seen.add(key)
    return {
      date:          toddmmyyyy(e.event_date),
      date_iso:      e.event_date,
      date_friendly: formatFriendly(e.event_date),
      start_time:    e.start_time || '',
      end_time:      e.end_time || '',
      truck_name:    canonicalName,
      venue_name:    e.venue_name || '',
      village:       e.village || '',
      notes:         e.event_notes || '',
    }
  }).filter(Boolean)

  return NextResponse.json({
    truck_slug:  truckSlug,
    truck_name:  canonicalName,
    events,
    next_event:  events[0] || null,
  })
}
