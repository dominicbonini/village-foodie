// app/api/admin/demo-reset/route.ts — "Reset for sending" on an outreach prospect's demo (14 October 2026).
//
// TWO THINGS, both keeping the menu, the truck's settings and the current event's settings:
//   1. STARTS THE SERVICE AFRESH NOW (lib/demo-restart.ts `restartDemoService`) — so ANY browser that loads
//      the demo after the reset, Dominic's signed-in Safari included, shows the fresh board (Dominic,
//      14 October 2026: "when i reset, then any browser should show the fresh order info");
//   2. RE-ARMS THE FIRST-OPEN RESTART (lib/demo-session.ts `rearmDemoFirstOpen`) — so whenever the truck
//      first opens the link, hours later, it is built afresh again around THAT moment. An admin who checks
//      the demo while signed in does not use that up (/api/demo/restart refuses an admin's claim).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { rearmDemoFirstOpen } from '@/lib/demo-session'
import { restartDemoService, DemoRestartError } from '@/lib/demo-restart'

// Rebuilding the board seeds the demo orders — seconds, not milliseconds.
export const maxDuration = 60

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const truckId = typeof body.truckId === 'string' ? body.truckId.trim() : ''
  if (!truckId) return NextResponse.json({ error: 'truckId required' }, { status: 400 })
  // Re-arm FIRST: it is also the check that this is an outreach demo (a demo- truck with a prospect), so
  // nothing is rebuilt on a truck it refuses.
  const r = await rearmDemoFirstOpen(supabase, truckId)
  if (!r.rearmed) return NextResponse.json({ ok: false, error: `Could not reset this demo: ${r.reason}` }, { status: 409 })
  try {
    const restart = await restartDemoService(supabase, truckId)
    return NextResponse.json({ ok: true, event: restart.event, seededOrders: restart.seededOrders, warnings: restart.warnings })
  } catch (err) {
    const msg = err instanceof DemoRestartError || err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ ok: false, error: `The demo is set to start fresh when they open it, but it could not be refreshed now: ${msg}` }, { status: 500 })
  }
}
