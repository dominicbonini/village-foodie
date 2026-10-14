// app/api/admin/demo-reset/route.ts — "Reset for sending" on an outreach prospect's demo (14 October 2026).
//
// Re-arms the demo's first-open restart (lib/demo-session.ts `rearmDemoFirstOpen`): whenever the truck next
// opens the link, the event and the demo orders are built afresh around that moment, with the menu, the
// truck's settings and the current event's settings kept. Nothing is deleted or rebuilt HERE — the restart
// happens on that open, so a link scanner or a late open can never see a stale board, and an admin who checks
// the demo again while signed in does not use it up (/api/demo/restart refuses an admin's claim).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { rearmDemoFirstOpen } from '@/lib/demo-session'

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
  const r = await rearmDemoFirstOpen(supabase, truckId)
  if (!r.rearmed) return NextResponse.json({ ok: false, error: `Could not reset this demo: ${r.reason}` }, { status: 409 })
  return NextResponse.json({ ok: true })
}
