// app/api/cron/auto-reject-offline-orders/route.ts
// ── 🔴 THE SWEEP THAT REFUSES ORDERS NOBODY CAN ACCEPT. THE FIRST SCHEDULED WRITER OF orders.status. ──
// A van offline in `no_auto_accept` mode keeps taking orders and every one lands `pending` with its slot
// held. The device is unreachable — that is the premise of the mode — so nothing can accept them. This
// refuses them on the truck's behalf after a delay the operator chose, and tells the customer why.
//
// ── 🔴 IT REJECTS THROUGH lib/orders/reject-order.ts AND NOWHERE ELSE ─────────────────────────────
// A reject releases a card authorisation. A second implementation would be a second place to get that
// wrong, which is why the branch was extracted from the dashboard route before this file existed. This
// route decides WHICH orders; `rejectOrder` decides what rejecting means.
//
// ── WHAT IT CANNOT DO ─────────────────────────────────────────────────────────────────────────────
// It cannot capture, and it cannot touch an order the operator has moved on: `claim_order_for_auto_reject`
// re-reads the status, the event's `open` state and the offline marker AFTER locking the row, so a van
// that has just pinged, an event that has closed, or an order somebody confirmed all yield nothing.
// It also cannot act at all until an operator sets `offline_auto_reject_mins` on a van — NULL MEANS OFF,
// and no van has a value today.
//
// ── SCHEDULE ──────────────────────────────────────────────────────────────────────────────────────
// Registered in vercel.json at */5. ⚠️ SO A DELAY OF N MINUTES MEANS N TO N+5 IN PRACTICE: the order's
// age when it is actually refused lands anywhere in one cron interval above the setting. The error is
// ALWAYS LATE, never early — an order is never rejected before its delay — but any UI must say "about
// 5-10 minutes", never "5 minutes". This codebase has already shipped a backstop reported as a
// prediction once ("resuming in ~119 min") and must not do it twice.
//
// ── 🔴 WHAT WOULD NOT BE NOTICED IF THIS JOB SILENTLY STOPPED: EVERYTHING. ────────────────────────
// There is no run-log table for it, no self-measured gap, no alert and no admin surface — and no error
// reporting service exists anywhere in this codebase. demo-cleanup solves this with four layers and
// still admits that only a human seeing a stale timestamp catches total death; none of those layers
// exists here, and building them was explicitly out of scope.
// ✅ THE FAILURE DIRECTION IS THE SAFE ONE, AND THAT IS WHY THAT IS ACCEPTABLE HERE. A stopped
// auto-reject leaves orders `pending` for the operator — TODAY'S BEHAVIOUR, unchanged since the product
// existed. Nothing is lost and nothing wrong is done; the customer is simply not told. Contrast the
// capture sweep, where a stopped run loses money the truck is owed.
// ⚠️ AND THE BACKLOG DOES NOT SURVIVE A GAP, unlike the capture sweep's. The marker is nulled on
// reconnect and expires in about two hours, so a missed run means those orders are never auto-rejected
// at all rather than caught up later. A resumed job cannot wake up and refuse yesterday's orders.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { rejectOrder } from '@/lib/orders/reject-order'

export const runtime = 'nodejs'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── 🔴 THE SENTENCE THE CUSTOMER READS, AND IT HAS TO BE TRUE IN EVERY CASE ───────────────────────
// It renders as "Reason: …" in the rejection email, ABOVE the payment sentence rejectOrder already
// builds — so it must say nothing about money: a pay-at-hatch order and a released card hold both pass
// through here and rejectionPaymentSentence is what distinguishes them.
// ⚠️ NO TIMEFRAME AND NO PROMISE. "Try again shortly" would be a prediction about a connection nobody
// can see, which is the failure this file's schedule note is about.
const CONNECTIVITY_REASON =
  'The van lost its internet connection, so this order could not be confirmed.'

// ⚠️ A SAFETY VALVE, NOT A POLICY — the same role `limit` plays in the capture sweep, which uses 100.
// LOWER THAN THAT ONE ON PURPOSE: each rejection here makes a Stripe call and sends an email, so 50 is
// already up to a hundred external round trips inside a single invocation, and the function timeout is
// the real ceiling. The */5 schedule collects the remainder within five minutes, and a backlog anywhere
// near 50 pending orders on one offline van is already far outside anything observed.
const BATCH_LIMIT = 50

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand — the
 *  same gate app/api/cron/capture-stranded-authorizations uses. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

type Claim = {
  order_key: string
  truck_id: string
  event_id: string
  order_id: string
  delay_mins: number
  age_secs: number
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // ⚠️ `?dry=1` LISTS WITHOUT REJECTING. For a human who wants to see what the schedule would do before
  // letting it do it — and on a path whose action is TERMINAL AND HAS NO UNDO, that is not a nicety.
  // Cron never sends it. The claim function writes nothing, so a dry run is identical work minus the
  // rejection: it exercises the REAL predicate rather than a copy of it.
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'

  // 🔴 THE EXCLUSION LIST IS WHAT MAKES THE LOOP TERMINATE. The claim writes nothing, so a row it hands
  // back is still eligible on the next call — in a dry run always, and in a live run whenever the
  // rejection failed to write. Without this the loop would be handed the same oldest order for ever.
  const seen: string[] = []
  const rejected: Array<{ order_id: string; order_key: string; hold_release: string; age_secs: number }> = []
  const failures: Array<{ order_key: string; error: string }> = []
  const startedAt = Date.now()

  while (seen.length < BATCH_LIMIT) {
    const { data, error } = await supabase.rpc('claim_order_for_auto_reject', { p_exclude: seen })
    if (error) {
      // 🔴 A 500, NOT AN `ok: true, rejected: 0`. The query itself failed, so this run knows NOTHING
      // about whether any order is stranded pending on an offline van. Reporting zero here would turn a
      // broken backstop into a clean bill of health, and Vercel's cron dashboard would show a green tick
      // over an unanswered question — the reasoning the capture sweep already states for the same case.
      console.error('[cron/auto-reject] 🔴 THE CLAIM QUERY FAILED — this run knows nothing:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    const claim = (Array.isArray(data) ? data[0] : data) as Claim | undefined
    if (!claim) break                                  // nothing eligible. The normal exit.
    seen.push(claim.order_key)

    if (dryRun) {
      rejected.push({ order_id: claim.order_id, order_key: claim.order_key, hold_release: 'dry_run', age_secs: claim.age_secs })
      continue
    }

    // The truck, for the customer email's sender and its name. rejectOrder reads `id` and `name` only.
    const { data: truck, error: truckErr } = await supabase
      .from('trucks').select('id, name').eq('id', claim.truck_id).single()
    if (truckErr || !truck) {
      failures.push({ order_key: claim.order_key, error: `truck ${claim.truck_id} unreadable: ${truckErr?.message ?? 'not found'}` })
      continue
    }

    try {
      // 🔴 'system' ON BOTH, AND IT IS THE HONEST VALUE RATHER THAN A BORROWED ONE. There is no request
      // and no human here; 'unknown' would mean "we could not tell", which is the opposite of true.
      // Both CHECK constraints on action_audit_log admit it — widened by hand on 19 August 2026.
      const result = await rejectOrder(supabase, {
        orderKey: claim.order_key,
        truck: { id: truck.id as string, name: (truck.name as string) ?? '' },
        rejectionReason: CONNECTIVITY_REASON,
        actor: { actorKind: 'system', actorId: null, actorLabel: null, userRole: null, currentUserName: null, foreignOperator: false },
        source: 'system',
      })
      if (!result.ok) {
        failures.push({ order_key: claim.order_key, error: 'order_not_found' })
        continue
      }
      // ⚠️ `hold_release` IS CARRIED OUT OF THIS ROUTE, not swallowed. A rejection whose hold did not go
      // back is the one outcome here worth a human reading, and rejectOrder has already written a
      // hold_release_failed audit row for it.
      if (result.holdRelease === 'failed' || result.holdRelease === 'captured') {
        console.error(`[cron/auto-reject] 🔴 order #${claim.order_id} rejected but the hold was NOT released: ${result.holdRelease}`)
      }
      rejected.push({ order_id: claim.order_id, order_key: claim.order_key, hold_release: result.holdRelease, age_secs: claim.age_secs })
    } catch (err) {
      // rejectOrder does not throw by design; this is the net for anything underneath it that does.
      // One order failing must not stop the run — the next claim is independent of this one.
      failures.push({ order_key: claim.order_key, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const durationMs = Date.now() - startedAt
  // ⚠️ `seen.length === BATCH_LIMIT` MEANS THE VALVE CLOSED, and it is reported rather than silent: the
  // run stopped early and there may be more waiting. The next run collects them.
  const hitLimit = seen.length >= BATCH_LIMIT
  console.log(`[cron/auto-reject] ok dry=${dryRun} claimed=${seen.length} rejected=${rejected.length} failures=${failures.length} hitLimit=${hitLimit} ${durationMs}ms`)

  return NextResponse.json({
    ok: true, dryRun, claimed: seen.length, rejected: rejected.length,
    failures: failures.length, hitLimit, durationMs, orders: rejected, errors: failures,
  })
}
