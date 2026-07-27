// app/api/demo/return/route.ts
// The return link from the saved-demo email (spec Stage 4).
//
// It CANNOT just point at /dashboard/<token>: by the time they click, the original event is in the past —
// closed or simply over — so they'd land on a dead board with no orders and conclude the product doesn't
// work. So the link re-provisions first: a fresh event (now → next hour +2h), fresh slot grid, freshly
// seeded orders, THEN redirect.
//
// Re-provisioning runs the SAME provisionDemo path as first-run, via `existingTruckId` → the
// `replaceExisting` branch in lib/provision-demo-event. That branch deletes the previous same-day event
// (and its orders) before writing the new one — mandatory, because slot_capacity is keyed on
// (truck_id, event_date, slot) and a second same-day event would silently overwrite the first's grid.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionDemo } from '@/lib/provision-demo'
import { isDemoIdentifier } from '@/lib/demo'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Land them on the landing page with a flag rather than a JSON error — this URL is clicked from an email
 *  by a non-technical person, and a raw error object is a dead end. */
function bounce(req: NextRequest, reason: string) {
  const url = new URL('/landing', req.url)
  url.hash = 'try'
  url.searchParams.set('demo', reason)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')?.trim()
  if (!token || !isDemoIdentifier(token)) return bounce(req, 'invalid')

  const { data: truck } = await supabase
    .from('trucks').select('id, dashboard_token').eq('dashboard_token', token).single()

  // Expired and swept, or never existed. Either way the honest outcome is "build a new one", not an error.
  if (!truck || !isDemoIdentifier(truck.id as string)) return bounce(req, 'expired')

  try {
    const result = await provisionDemo(supabase, { existingTruckId: truck.id as string })
    return NextResponse.redirect(new URL(`/dashboard/${result.dashboardToken}`, req.url))
  } catch (err) {
    console.error('[demo/return] re-provision failed:', err)
    // The truck and its menu still exist — send them to the dashboard anyway. A stale board is a poorer
    // experience than a fresh one, but it is far better than bouncing someone away from the demo they
    // deliberately came back to.
    return NextResponse.redirect(new URL(`/dashboard/${token}`, req.url))
  }
}
