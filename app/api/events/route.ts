// app/api/events/route.ts
// Returns the next upcoming event(s) for a given truck slug
// Reads from the same master Google Sheet CSV as the main site

import { NextRequest, NextResponse } from 'next/server'
import { createSlug } from '@/lib/utils'

const EVENTS_CSV_URL  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=0&single=true&output=csv'
const TRUCKS_CSV_URL  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=28504033&single=true&output=csv'

export const revalidate = 300  // cache for 5 minutes

function parseCSVRow(row: string): string[] {
  const cols: string[] = []
  let cell = '', inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"' && inQuotes && row[i+1] === '"') { cell += '"'; i++ }
    else if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { cols.push(cell.trim()); cell = '' }
    else { cell += ch }
  }
  cols.push(cell.trim())
  return cols.map(c => c.replace(/^"|"$/g, '').trim())
}

// Parse dd/mm/yyyy to a Date
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
}

function formatISODate(dateStr: string): string {
  const d = parseDate(dateStr)
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function formatFriendly(dateStr: string): string {
  const d = parseDate(dateStr)
  if (!d) return dateStr
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1)
  const check = new Date(d); check.setHours(0,0,0,0)
  const dayName = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const day = d.getDate()
  const suffix = [11,12,13].includes(day) ? 'th' : ['st','nd','rd'][((day%10)-1)] || 'th'
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
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

  const fetchOpts = { next: { revalidate: 300 } as RequestInit['next'] }

  try {
    const [eventsRes, trucksRes] = await Promise.all([
      fetch(EVENTS_CSV_URL, fetchOpts),
      fetch(TRUCKS_CSV_URL, fetchOpts),
    ])

    const [eventsText, trucksText] = await Promise.all([
      eventsRes.text(),
      trucksRes.text(),
    ])

    // Build truck alias map: slug -> canonical name
    const truckRows = trucksText.split('\n').slice(1)
    const aliasMap: Record<string, string> = {}
    truckRows.forEach(row => {
      const cols = parseCSVRow(row)
      if (!cols[0]) return
      const name = cols[0]
      const slug = createSlug(name)
      aliasMap[slug] = name
      // Also map aliases (column 17)
      if (cols[17]) {
        cols[17].split(',').forEach(alias => {
          const aSlug = createSlug(alias.trim())
          if (aSlug) aliasMap[aSlug] = name
        })
      }
    })

    const canonicalName = aliasMap[truckSlug]

    // Find upcoming events for this truck
    const today = new Date(); today.setHours(0,0,0,0)
    const eventRows = eventsText.split('\n').slice(1)
    const upcoming: any[] = []

    eventRows.forEach(row => {
      const cols = parseCSVRow(row)
      if (!cols[0] || !cols[3]) return

      const rawTruck = cols[3]
      const truckSlugInEvent = createSlug(rawTruck)
      const canonicalInEvent = aliasMap[truckSlugInEvent]

      // Match by slug or by canonical name
      const isMatch = truckSlugInEvent === truckSlug ||
        (canonicalName && canonicalInEvent === canonicalName) ||
        createSlug(rawTruck) === truckSlug

      if (!isMatch) return

      const eventDate = parseDate(cols[0])
      if (!eventDate || eventDate < today) return

      upcoming.push({
        date:       cols[0],                    // dd/mm/yyyy
        date_iso:   formatISODate(cols[0]),     // yyyy-mm-dd for Supabase
        date_friendly: formatFriendly(cols[0]),
        start_time: cols[1] || '',
        end_time:   cols[2] || '',
        truck_name: canonicalName || rawTruck,
        venue_name: cols[4] || '',
        village:    cols[5] || '',
        notes:      cols[6] || '',
        _sortDate:  eventDate.getTime(),
      })
    })

    // Sort by date ascending and deduplicate
    upcoming.sort((a, b) => a._sortDate - b._sortDate)
    const seen = new Set<string>()
    const deduped = upcoming.filter(e => {
      const key = `${e.date_iso}|${createSlug(e.venue_name)}|${createSlug(e.village)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Remove internal sort key
    const events = deduped.map(({ _sortDate, ...e }) => e)

    return NextResponse.json({
      truck_slug: truckSlug,
      truck_name: canonicalName || truckSlug,
      events,
      next_event: events[0] || null,
    })

  } catch (err: any) {
    console.error('Events API error:', err)
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 })
  }
}