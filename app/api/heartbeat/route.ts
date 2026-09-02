import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── PER-ROUTE CEILING ─────────────────────────────────────────────────────────────────────────────
// THE HEARTBEAT. The smallest route here (132 lines): stamp last_heartbeat_at on the van, and clear
// truck_events.online_paused_until when a device returns. Two indexed writes, no external service.
// SLOWEST LEGITIMATE CASE: two round trips on a cold connection. Healthy is tens of milliseconds.
// \u{1F534} 10s IS THE TIGHTEST CAP HERE ON PURPOSE. It fires every 15s from every device, so it is the
// route most able to build a backlog, and it is the one with the least excuse for taking any time.
// IF EXCEEDED: 504. The caller ignores the result (it is fire-and-forget) and the next tick is 15s
// away; a missed beat costs at most one interval of staleness in the auto-pause monitor.
export const maxDuration = 10


const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Clear any offline auto-pause that the heartbeat-monitor set on this van's events. Pause is now
// EVENT-scoped (truck_events.online_paused_until), so a returning device clears it there — not on
// the van. Only monitor-paused events have it set, so no live-now logic is needed on clear.
//
// ORDERING (replaces the old single-row atomic update): last_heartbeat_at lives on truck_vans and
// online_paused_until now lives on truck_events — two tables, so they can't be one UPDATE. Every
// caller below stamps last_heartbeat_at FIRST, then calls this. That ordering is the safeguard: the
// monitor only pauses events whose VAN is stale (last_heartbeat_at < threshold), so once a ping has
// refreshed last_heartbeat_at the van is no longer stale and the monitor's next run cannot re-pause
// the device that just pinged — no interleave window where a fresh ping gets re-paused.
async function clearOfflinePauseForVans(vanIds: string[]) {
  if (vanIds.length === 0) return
  await supabaseAdmin
    .from('truck_events')
    .update({ online_paused_until: null })
    .in('van_id', vanIds)
    .not('online_paused_until', 'is', null)
  // -- THE OTHER MODE'S MARKER, CLEARED THE SAME WAY AND FOR THE SAME REASON --
  // `offline_no_autoaccept_until` is what /api/orders/submit reads to force new orders `pending` while
  // the van is offline. A returning ping means the van is back, so auto-accept must resume on the very
  // next order — exactly as ordering resumes above.
  // NOTE: A SEPARATE STATEMENT, NOT A SECOND FIELD IN THE ONE ABOVE: each is filtered on its own column
  // being non-null, so neither touches rows the other owns and neither widens the other's row set.
  // NOTE: Best-effort like its sibling — an error here leaves a marker that EXPIRES on its own (the monitor
  // writes now + 2h), so the failure mode is "auto-accept resumes late", never "ordering stays blocked".
  await supabaseAdmin
    .from('truck_events')
    .update({ offline_no_autoaccept_until: null })
    .in('van_id', vanIds)
    .not('offline_no_autoaccept_until', 'is', null)
}

export async function POST(req: NextRequest) {
  try {
    const { vanId, token } = await req.json()

    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    const resolvedVanId = vanId as string | undefined

    if (!resolvedVanId) {
      // No van specified (operator dashboard ping) — stamp ALL the truck's active vans AND clear
      // offline-pause on their events (this is what fixes "online dashboard still shows Paused").
      const { data: truck } = await supabaseAdmin
        .from('trucks')
        .select('id')
        .eq('dashboard_token', token)
        .eq('active', true)
        .single()

      if (!truck) {
        return NextResponse.json({ error: 'invalid token' }, { status: 401 })
      }

      const { data: vans } = await supabaseAdmin
        .from('truck_vans')
        .select('id')
        .eq('truck_id', truck.id)
        .eq('active', true)

      const vanIds = (vans || []).map(v => v.id)
      await supabaseAdmin
        .from('truck_vans')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .in('id', vanIds)
      await clearOfflinePauseForVans(vanIds)

      return NextResponse.json({ ok: true })
    }

    // Van heartbeat — verify token is the van's kds_token
    const { data: vanByKds } = await supabaseAdmin
      .from('truck_vans')
      .select('id, truck_id')
      .eq('kds_token', token)
      .eq('active', true)
      .single()

    if (vanByKds) {
      await supabaseAdmin
        .from('truck_vans')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq('id', vanByKds.id)
      await clearOfflinePauseForVans([vanByKds.id])
      return NextResponse.json({ ok: true })
    }

    // Fall back to dashboard_token — verify the van belongs to this truck
    const { data: truck } = await supabaseAdmin
      .from('trucks')
      .select('id')
      .eq('dashboard_token', token)
      .eq('active', true)
      .single()

    if (!truck) {
      return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    }

    const { data: van } = await supabaseAdmin
      .from('truck_vans')
      .select('id')
      .eq('id', resolvedVanId)
      .eq('truck_id', truck.id)
      .eq('active', true)
      .single()

    if (!van) {
      return NextResponse.json({ error: 'van not found' }, { status: 404 })
    }

    await supabaseAdmin
      .from('truck_vans')
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq('id', van.id)
    await clearOfflinePauseForVans([van.id])

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
