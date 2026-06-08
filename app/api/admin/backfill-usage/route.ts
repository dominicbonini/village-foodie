// app/api/admin/backfill-usage/route.ts
// ONE-OFF backfill for the event-keying migration (option B). After the schema chunks
// run (production_slot_usage re-keyed by event_id and emptied), this rebuilds the table
// per EVENT from the orders table — REUSING rebuildProductionSlotUsage (no SQL transform,
// no re-implementation). Date-scoped orchestrator: one call per (truck_id, event_date)
// rebuilds every non-cancelled event on that date as its own event-keyed rows.
//
// Safe to re-run (idempotent: delete-then-rebuild from orders). Lazy reseed already covers
// reads between migration and this run; this just makes the whole table deterministic.
//
// Run:  curl -X POST "$APP_URL/api/admin/backfill-usage?secret=$SUPABASE_SERVICE_ROLE_KEY"

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { localTodayIso } from '@/lib/time-utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Guard: require the service-role key as a shared secret (never exposed to clients).
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const today = localTodayIso()

  // Every upcoming non-cancelled event. rebuildProductionSlotUsage is date-scoped, so we
  // only need each unique (truck_id, event_date) once — it rebuilds all events on the date.
  const { data: events, error } = await supabase
    .from('truck_events')
    .select('truck_id, event_date')
    .neq('status', 'cancelled')
    .gte('event_date', today)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const seen = new Set<string>()
  const pairs: { truckId: string; eventDate: string }[] = []
  for (const e of events || []) {
    const key = `${e.truck_id}|${e.event_date}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ truckId: e.truck_id, eventDate: e.event_date })
  }

  let ok = 0
  const failures: { truckId: string; eventDate: string; error: string }[] = []
  for (const { truckId, eventDate } of pairs) {
    try {
      await rebuildProductionSlotUsage(supabase, truckId, eventDate)
      ok++
    } catch (err: any) {
      failures.push({ truckId, eventDate, error: err?.message ?? String(err) })
    }
  }

  return NextResponse.json({
    from_date: today,
    dates_rebuilt: ok,
    total_pairs: pairs.length,
    failures,
  })
}
