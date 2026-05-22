import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  const { error } = await supabase
    .from('discovery_events')
    .upsert(rows, {
      onConflict: 'event_date,truck_name,venue_name',
      ignoreDuplicates: false
    })

  if (error) {
    console.error('Inbound schedule write failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: rows.length })
}
