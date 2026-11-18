import { NextRequest, NextResponse } from 'next/server'
import { truckTimeZone } from '@/lib/truck-time'
import { getLocalDateInTz, getNowMinsInTz } from '@/lib/time-utils'
import { upcomingQueryFloor, isUpcomingOrRunning } from '@/lib/event-window'
import { createClient } from '@supabase/supabase-js'
// Language Phase 1d: a refusal of ours is `{ error: <today's English>, …, code, params }` (lib/i18n/manage-errors.ts), in the
// truck's language (en-GB before the truck is known). A database's or exception's message is passed on as it comes.
import { manageErrorBody } from '@/lib/i18n/manage-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { requireMember } from '@/lib/auth/require-member'   // dashboard-auth-2: the member gate (log mode)

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
  // dashboard-auth-2: the member gate, LOG MODE (lib/auth/require-member.ts) — records a caller the planned
  // "signed-in team members only" rule would refuse; never refuses or delays while AUTH_MODE is 'log'.
  { const gate = await requireMember(req, supabase, truck, 'events_list', { route: '/api/events/manage', group: 'read' }); if (gate.refuse) return gate.refuse }

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
  let events = data
  if (upcomingTz) {
    const today = getLocalDateInTz(upcomingTz), nowMins = getNowMinsInTz(upcomingTz)
    events = data ? data.filter(e => isUpcomingOrRunning(e, today, nowMins)) : data
  }
  // events-overlap-2: `counts=1` (the staff screens only) adds `order_counts` — { event id: orders that are not cancelled },
  // online and walk-up alike — for the event list's "6 orders" and the approve/start dialogs. Opt-in, so Manage's read
  // is unchanged. A failed count read sends no `order_counts` (the screens then show none) rather than failing the list.
  if (req.nextUrl.searchParams.get('counts') === '1') {
    const ids = (events ?? []).map(e => e.id as string)
    const order_counts = await countOrdersByEvent(truck.id, ids)
    return NextResponse.json(order_counts ? { events, order_counts } : { events })
  }
  return NextResponse.json({ events })
}

/** Orders per event, not cancelled. Read in pages of 1,000 (the API's row cap) so a busy event is never under-counted. */
async function countOrdersByEvent(truckId: string, ids: string[]): Promise<Record<string, number> | null> {
  const counts: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  if (!ids.length) return counts
  const PAGE = 1000
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from('orders')
      .select('event_id')
      .eq('truck_id', truckId)
      .in('event_id', ids)
      .neq('status', 'cancelled')
      .order('order_key', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.error('[events/manage] order counts failed:', error.message); return null }
    for (const r of data ?? []) if (r.event_id) counts[r.event_id] = (counts[r.event_id] ?? 0) + 1
    if (!data || data.length < PAGE) break
  }
  return counts
}
