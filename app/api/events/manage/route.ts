import { NextRequest, NextResponse } from 'next/server'
import { truckTimeZone } from '@/lib/truck-time'
import { getLocalDateInTz, getNowMinsInTz } from '@/lib/time-utils'
import { upcomingQueryFloor, isUpcomingOrRunning } from '@/lib/event-window'
import { createClient } from '@supabase/supabase-js'
// Language Phase 1d: a refusal of ours is `{ error: <today's English>, …, code, params }` (lib/i18n/manage-errors.ts), in the
// truck's language (en-GB before the truck is known). A database's or exception's message is passed on as it comes.
import { manageErrorBody } from '@/lib/i18n/manage-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const status = req.nextUrl.searchParams.get('status') // optional filter
  const upcoming = req.nextUrl.searchParams.get('upcoming') // 'true' for future only

  if (!token) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'token_required'), { status: 400 })

  const { data: truck } = await supabase
    .from('trucks')
    .select('id, timezone, country')
    .eq('dashboard_token', token)
    .single()

  if (!truck) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'truck_not_found'), { status: 404 })

  let query = supabase
    .from('truck_events')
    .select(`*, event_deals ( id, bundle_id, active, overridden )`)
    .eq('truck_id', truck.id)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (status) query = query.eq('status', status)
  // 🔴 AN EVENT THAT RUNS PAST MIDNIGHT (lib/event-window.ts): `event_date >= today` dropped a running 20:00–00:30
  // event at midnight. The query reads from YESTERDAY and `isUpcomingOrRunning` keeps a row dated today or later, or
  // yesterday's overnight event until its end — so for every other event the list is exactly the old one.
  let upcomingTz: string | null = null
  if (upcoming === 'true') {
    // The truck's today (Phase 2B; the UTC date was yesterday from 00:00 to 01:00 BST).
    upcomingTz = await truckTimeZone(truck)
    query = query.gte('event_date', upcomingQueryFloor(upcomingTz))
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (upcomingTz) {
    const today = getLocalDateInTz(upcomingTz), nowMins = getNowMinsInTz(upcomingTz)
    return NextResponse.json({ events: data ? data.filter(e => isUpcomingOrRunning(e, today, nowMins)) : data })
  }
  return NextResponse.json({ events: data })
}
