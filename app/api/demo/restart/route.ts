// app/api/demo/restart/route.ts
// "Start a new service" — the demo dashboard's button when its event has elapsed or been closed.
//
// Replaces the automatic roll (lib/demo-event-refresh, deleted): an elapsed demo now ENDS and the
// visitor restarts it deliberately, rather than the board silently shifting itself forward under them.
// See lib/demo-restart.ts for why the roll had to go — it breached the per-slot capacity guarantee and
// carried the visitor's own test order into the next day.
//
// AUTHORISATION is the dashboard_token, the same credential the demo dashboard already holds and the
// same one /api/dashboard authenticates with. That is sufficient here and nowhere near sufficient in
// general: this endpoint DELETES EVERY ORDER on the truck it is given, so it refuses anything whose
// resolved truck id is not `demo-` prefixed. A leaked operator token cannot reach this code path.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'
import { restartDemoService } from '@/lib/demo-restart'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Wipe + re-provision + re-seed. Comfortably inside the default ceiling, but the seeding round trips are
// the same ones provisionDemo budgets 300s for, so it is stated rather than inherited.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  let token: string | null = null
  try {
    const body = await req.json()
    token = typeof body?.token === 'string' ? body.token.trim() : null
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Cheap gate before touching the database: the token itself must look like a demo token.
  if (!token || !isDemoIdentifier(token)) {
    return NextResponse.json({ error: 'Not a demo session' }, { status: 403 })
  }

  const { data: truck } = await supabase
    .from('trucks').select('id').eq('dashboard_token', token).single()

  if (!truck) {
    return NextResponse.json({ error: 'Demo not found' }, { status: 404 })
  }

  // 🔴 THE REAL GUARD — the resolved TRUCK ID, not the token that got us here. restartDemoService
  // asserts this again internally; both checks are deliberate. This one gives a clean 403 to a caller,
  // the inner one makes the library safe for any future caller that forgets.
  if (!isDemoIdentifier(truck.id as string)) {
    return NextResponse.json({ error: 'Not a demo truck' }, { status: 403 })
  }

  try {
    const result = await restartDemoService(supabase, truck.id as string)
    console.log(
      `[demo] service restarted for ${truck.id}: ${result.ordersDeleted} orders + ${result.eventsDeleted} events wiped, ` +
      `new window ${result.event.event_date} ${result.event.start_time}-${result.event.end_time}, ` +
      `${result.seededOrders} orders seeded` +
      (result.warnings.length ? ` | warnings: ${JSON.stringify(result.warnings)}` : ''),
    )
    return NextResponse.json({
      ok: true,
      event: {
        id: result.event.id,
        event_date: result.event.event_date,
        start_time: result.event.start_time,
        end_time: result.event.end_time,
      },
      seededOrders: result.seededOrders,
    })
  } catch (err) {
    console.error('[demo] service restart failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not start a new service' }, { status: 500 })
  }
}
