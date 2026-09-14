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
import { claimDemoFirstOpen } from '@/lib/demo-session'
import { verifyAdmin } from '@/lib/auth/admin'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Wipe + re-provision + re-seed. Comfortably inside the default ceiling, but the seeding round trips are
// the same ones provisionDemo budgets 300s for, so it is stated rather than inherited.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  let token: string | null = null
  // ── `claimFirstOpen` — THE SECOND TRIGGER (T2) ──────────────────────────────────────────────────
  // Absent (the "Start a new service" button, and the not-live auto-restart) → this route behaves
  // EXACTLY as it did: restart unconditionally. Present → restart ONLY IF this call is the one that
  // successfully claims `demo_sessions.first_opened_at`, so the prospect's very first open gets a board
  // starting from their own moment even when the existing event is still live.
  let claimFirstOpen = false
  try {
    const body = await req.json()
    token = typeof body?.token === 'string' ? body.token.trim() : null
    claimFirstOpen = body?.claimFirstOpen === true
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

  // ── T2 GATING — ADMIN PREVIEW FIRST, THEN THE CLAIM ────────────────────────────────────────────
  // Both checks are SERVER-SIDE and authoritative. The client makes the same two decisions before it
  // POSTs at all, but only as an optimisation: its `isAdmin` arrives asynchronously from /api/auth/me
  // and is `false` for the first moments of every load, so a client-only check would let an admin's
  // preview consume the first open in the race. This one cannot be raced and cannot be forged.
  if (claimFirstOpen) {
    // 🔴 AN ADMIN PREVIEW MUST NOT CONSUME THE PROSPECT'S FIRST OPEN. Dominic opens these links to check
    // them; if that claimed `first_opened_at`, the prospect he then sends it to would land on the board
    // Dominic saw rather than a fresh one, and the feature would be silently dead for exactly the demos
    // he checked. `verifyAdmin` is the canonical check (Supabase session cookie on web, Bearer on the
    // native app → `operators.is_admin`) — the same function /api/admin and the landing gate use.
    //
    // ⚠️ WHEN THE CHECK CANNOT RUN IT FAILS *OPEN* — treated as "not an admin", so the claim proceeds.
    // Deliberate, and it is the cheaper error: a prospect landing on a stale board is the defect this
    // whole task exists to remove, whereas an admin whose preview consumed the first open still has the
    // "Start a new service" button and can see what the prospect will see by pressing it.
    let viewerIsAdmin = false
    try {
      viewerIsAdmin = await verifyAdmin(req)
    } catch (err) {
      console.warn('[demo/restart] admin check failed — treating the viewer as a prospect:', err instanceof Error ? err.message : err)
    }
    if (viewerIsAdmin) {
      return NextResponse.json({ ok: true, restarted: false, skipped: 'admin-preview' })
    }

    const claim = await claimDemoFirstOpen(supabase, truck.id as string)
    if (!claim.claimed) {
      // 'already-opened'  — a second device, a reload, or the loser of two simultaneous opens.
      // 'not-outreach'    — an anonymous landing-page demo; T2 does not apply to it (see the claim).
      // 'no-session'      — no demo_sessions row; nothing can record that this happened, so do nothing.
      // 'unavailable'     — the column is missing (migration unapplied) or the write failed.
      // 🔴 NONE OF THESE RESTART. An unclaimable first open that restarted anyway would wipe the board
      // on every single load, which is far worse than the stale board it was trying to fix.
      if (claim.reason === 'unavailable' || claim.reason === 'no-session') {
        console.warn(`[demo/restart] first-open claim unavailable for ${truck.id}: ${claim.reason}${claim.detail ? ` — ${claim.detail}` : ''}`)
      }
      return NextResponse.json({ ok: true, restarted: false, skipped: claim.reason })
    }
    console.log(`[demo] first open claimed for ${truck.id} at ${claim.at} — restarting from the visitor's own moment`)
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
      // ADDITIVE. `false` is only ever returned by the T2 skip paths above, which return early — so the
      // button and the not-live auto-restart always see `true` and their behaviour is unchanged.
      restarted: true,
      ...(claimFirstOpen ? { firstOpen: true } : {}),
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
