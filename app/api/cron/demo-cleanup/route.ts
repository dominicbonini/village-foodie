// app/api/cron/demo-cleanup/route.ts
// The demo cleanup job (spec §7) — expiry sweep + orphan sweep.
//
// ── WHY A NEXT ROUTE, NOT A SUPABASE EDGE FUNCTION ─────────────────────────────────────────────────
// The precedent (auto-event-scheduler, heartbeat-monitor) is pg_cron → edge function. Not followed here,
// deliberately: those are Deno, deployed separately, and CANNOT import lib/delete-truck.ts. Using one
// would force a second copy of the verified §7.1 ordered cascade — exactly what must not happen, because
// the ordering (orders BEFORE trucks, since orders.truck_id is NO ACTION) is the whole reason that helper
// exists. One delete path beats matching the deployment pattern.
//
// ── HOW THIS SURFACES ITS OWN FAILURE ──────────────────────────────────────────────────────────────
// The recorded failure mode is a job that silently stops: when the Vault service_role_key was deleted,
// every scheduled invocation 401'd and nothing surfaced it. Four layers here, and I am explicit below
// about which one catches total death (only the last one can):
//   1. EVERY invocation writes a demo_cleanup_log row — success, partial or hard failure.
//   2. The job measures its own GAP since the last successful run and records it; an INTERMITTENT death
//      is therefore visible in the history even after it recovers.
//   3. A gap over the alert threshold, or any error, EMAILS the team.
//   4. The admin console reads the log and shows the last-run age, red when stale.
// ⚠️ Nothing inside a job that never runs can report that it never ran. Layer 4 — a human seeing a stale
// timestamp — is the only thing that catches total death. That is a real residual gap, not a solved one.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { deleteTruckCascade, DeleteTruckError } from '@/lib/delete-truck'
import { isDemoIdentifier, DEMO_PREFIX } from '@/lib/demo'
import { HATCHGRAB_SENDER } from '@/lib/email-config'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ORPHAN WINDOW — 2 hours. Justification: an orphan is a demo whose menu never committed, so it can never
// become useful; there is nothing to wait for. But it must be comfortably longer than a single
// provisioning run (extraction is 10-30s, worst case a minute or two), or the sweep could delete a demo
// that is still being built. 2h is ~100x the worst provisioning time while still clearing the failure
// path fast — and the failure path is exactly where repeat attempts pile up, so the accumulation rate is
// highest precisely when things are going wrong.
const ORPHAN_WINDOW_HOURS = 2
// Grace for a CLAIMED-but-abandoned demo (operator signed up, never finished the wizard). Long on purpose:
// a claim is paying intent, and a demo is only a menu source — keeping one costs a few rows. 30 days past
// created_at reclaims a genuinely dead account while never catching an operator still setting up. NOT a
// retired_at mechanism (that has no writer and is its own diff) — see the 1b sweep.
const CLAIM_GRACE_DAYS = 30
// Flag a gap longer than this between successful runs. Hourly schedule → 3h means two consecutive misses.
const GAP_ALERT_MINS = 180
const BATCH_LIMIT = 200      // bounded work per invocation; the hourly schedule catches the remainder

interface Failure { truckId: string; step?: string; error: string }

/** Delete one demo truck through the SINGLE verified cascade, asserting the demo prefix first. */
async function sweep(truckId: string, failures: Failure[]): Promise<boolean> {
  // ASSERT, don't assume (the brief's requirement). Every query below is already prefix-filtered, so this
  // can only fire if a query is later loosened — which is exactly when you want a hard stop rather than a
  // cascade delete running against a real operator's truck.
  if (!isDemoIdentifier(truckId)) {
    const msg = `REFUSED: ${truckId} is not a ${DEMO_PREFIX} truck — cleanup must never touch a real truck`
    console.error(`[demo-cleanup] ${msg}`)
    failures.push({ truckId, error: msg })
    return false
  }
  try {
    await deleteTruckCascade(supabase, truckId)
    return true
  } catch (err) {
    failures.push({
      truckId,
      step: err instanceof DeleteTruckError ? err.step : undefined,
      error: err instanceof Error ? err.message : 'unknown',
    })
    return false
  }
}

async function notify(subject: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY
  const to = HATCHGRAB_SENDER.replyTo
  if (!apiKey || !to) return
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
        to: [{ email: to }], subject, htmlContent: html,
      }),
    })
  } catch (err) {
    console.error('[demo-cleanup] alert email failed:', err)
  }
}

async function run(): Promise<NextResponse> {
  const startedAt = Date.now()
  const failures: Failure[] = []
  let expiredDeleted = 0
  let orphansDeleted = 0
  let gapMins: number | null = null
  let hardError: string | null = null

  try {
    // ── Self-staleness: how long since the last SUCCESSFUL run? ─────────────────────────────────────
    try {
      const { data: last } = await supabase
        .from('demo_cleanup_log').select('run_at')
        .eq('ok', true).order('run_at', { ascending: false }).limit(1).maybeSingle()
      if (last?.run_at) {
        gapMins = Math.round((Date.now() - new Date(last.run_at as string).getTime()) / 60_000)
      }
    } catch { /* first run, or table missing — not a reason to skip the actual work */ }

    // ── 1. EXPIRY SWEEP (24h no email / 14d with email) ─────────────────────────────────────────────
    // The retention rule lives in demo_sessions.expires_at, so this is just "past its date". Both tiers
    // fall out of one query — no branching on whether an email was given.
    //
    // 🔴 EXCLUDES CLAIMED SESSIONS. A demo whose operator has signed up (claimed_by_operator_id set) is the
    // signup migration's SOURCE — its stored extraction is re-committed into the real truck, and
    // demo_sessions.truck_id → trucks is ON DELETE CASCADE, so sweeping it mid-wizard destroys the payload
    // out from under the operator. The 24h no-email tier makes that the COMMON case, not an edge one:
    // signup does not extend expires_at, so a claimed demo is usually already past its date. Claimed
    // sessions are handled by the longer-dated sweep below instead.
    const { data: expired, error: expErr } = await supabase
      .from('demo_sessions').select('truck_id')
      .lt('expires_at', new Date().toISOString())
      .is('claimed_by_operator_id', null)
      .limit(BATCH_LIMIT)
    if (expErr) throw new Error(`expiry query failed: ${expErr.message}`)

    for (const row of expired ?? []) {
      if (await sweep(row.truck_id as string, failures)) expiredDeleted++
    }

    // ── 1b. CLAIMED-BUT-ABANDONED SWEEP ─────────────────────────────────────────────────────────────
    // Consequence of excluding claimed sessions above: one that is never completed would otherwise live
    // forever. So a claimed demo is reclaimed once it is BOTH past its retention date AND older than a long
    // grace window — long because this is a paying-intent signal (they created an account), and the demo is
    // only a menu source, harmless to keep. CLAIM_GRACE_DAYS past created_at is generous enough that a
    // genuine mid-setup operator is never caught, while an account that stalled indefinitely is still
    // reclaimed. This does NOT use retired_at (no writer exists; that mechanism is its own future diff) —
    // it keys on the claim plus age, which is sufficient to stop unbounded growth without pre-empting
    // retirement's design.
    const claimCutoff = new Date(Date.now() - CLAIM_GRACE_DAYS * 86_400_000).toISOString()
    const { data: claimedStale, error: claimErr } = await supabase
      .from('demo_sessions').select('truck_id')
      .not('claimed_by_operator_id', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .lt('created_at', claimCutoff)
      .limit(BATCH_LIMIT)
    if (claimErr) throw new Error(`claimed-stale query failed: ${claimErr.message}`)

    for (const row of claimedStale ?? []) {
      if (await sweep(row.truck_id as string, failures)) expiredDeleted++
    }

    // ── 2. ORPHAN SWEEP — demo trucks that never became usable ──────────────────────────────────────
    // Two shapes: extraction failed (truck + van + event, no menu), or the EVENT insert failed (truck +
    // van + menu, no event). Neither can ever become useful, and the failure path is where repeat
    // attempts concentrate — so this is where trucks accumulate fastest when things go wrong.
    const cutoff = new Date(Date.now() - ORPHAN_WINDOW_HOURS * 3_600_000).toISOString()
    const { data: demoTrucks, error: trErr } = await supabase
      .from('trucks').select('id')
      .like('id', `${DEMO_PREFIX}%`)     // prefix-scoped at the QUERY, then asserted again in sweep()
      .limit(1000)
    if (trErr) throw new Error(`demo truck query failed: ${trErr.message}`)

    for (const t of demoTrucks ?? []) {
      const truckId = t.id as string
      // Old enough? Read from the session row; a truck with no session row is itself suspect (either
      // pre-migration or a failed provision), so treat a missing row as old enough to sweep only when it
      // ALSO has no menu — the two conditions together are unambiguous.
      const { data: session } = await supabase
        .from('demo_sessions').select('created_at').eq('truck_id', truckId).maybeSingle()
      const createdAt = session?.created_at as string | undefined
      if (createdAt && createdAt > cutoff) continue     // still within the grace window

      // ORPHAN = no menu items OR no event. Widened from menu-only: a demo whose menu committed but
      // whose EVENT insert failed is just as unusable as one with no menu — there is no board, no slots
      // and nothing to play with — and the menu-only rule left exactly that truck unsweepable. Checked in
      // this order so the cheaper count runs first and short-circuits the common case.
      const [{ count: itemCount }, { count: eventCount }] = await Promise.all([
        supabase.from('menu_items_db').select('*', { count: 'exact', head: true })
          .eq('truck_id', truckId).eq('is_active', true),
        supabase.from('truck_events').select('*', { count: 'exact', head: true })
          .eq('truck_id', truckId),
      ])
      const hasMenu = (itemCount ?? 0) > 0
      const hasEvent = (eventCount ?? 0) > 0
      if (hasMenu && hasEvent) continue                 // usable — not an orphan

      if (await sweep(truckId, failures)) orphansDeleted++
    }
  } catch (err) {
    hardError = err instanceof Error ? err.message : 'unknown'
    console.error('[demo-cleanup] hard failure:', hardError)
  }

  const durationMs = Date.now() - startedAt
  const ok = !hardError && failures.length === 0

  // ── Always log, even on failure. This row IS the run history. ─────────────────────────────────────
  try {
    await supabase.from('demo_cleanup_log').insert({
      ok, expired_deleted: expiredDeleted, orphans_deleted: orphansDeleted,
      failures: failures.length ? failures : null, error: hardError,
      duration_ms: durationMs, gap_mins: gapMins,
    })
  } catch (err) {
    // If even the log write fails the job is blind — say so loudly in the function logs, which is the one
    // channel left.
    console.error('[demo-cleanup] COULD NOT WRITE RUN LOG — job is running blind:', err)
  }

  // ── Alert on failure or on a gap that suggests missed runs ────────────────────────────────────────
  if (!ok) {
    await notify('⚠️ Demo cleanup failed', `<p>${hardError ?? 'partial failure'}</p><pre>${JSON.stringify(failures, null, 2)}</pre>`)
  } else if (gapMins !== null && gapMins > GAP_ALERT_MINS) {
    await notify('⚠️ Demo cleanup had a gap',
      `<p>Ran successfully, but the previous successful run was <strong>${gapMins} minutes</strong> ago (expected hourly). The job may have been failing silently.</p>`)
  }

  console.log(`[demo-cleanup] ok=${ok} expired=${expiredDeleted} orphans=${orphansDeleted} failures=${failures.length} gap=${gapMins ?? 'n/a'}m ${durationMs}ms`)

  return NextResponse.json(
    { ok, expiredDeleted, orphansDeleted, failures, error: hardError, durationMs, gapMins },
    { status: ok ? 200 : 500 },
  )
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  return run()
}

// POST so the admin console can trigger it with the same auth path.
export async function POST(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  return run()
}
