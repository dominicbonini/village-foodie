// app/api/cron/capture-stranded-authorizations/route.ts
// ── 🔴 THE SWEEP THAT TAKES MONEY THE TRUCK IS OWED. THE MIRROR OF cancel-stale-authorizations. ────
// That job releases holds behind orders that will NEVER exist. This one takes holds behind orders that
// ALREADY exist and have been accepted. Between them, every authorisation this system creates ends as
// either captured money or a released hold — which is the promise the whole authorize-then-capture
// design makes, and which nothing enforced until this file existed.
//
// ── 🔴 THE PARTITION, AND WHY THE TWO JOBS CAN NEVER COLLIDE ──────────────────────────────────────
//   cancel-stale-authorizations   `promoted_at IS NULL`      — no order, hold released
//   THIS JOB                      `promoted_at IS NOT NULL`  — order accepted, hold captured
// The predicates are complements. No draft is visible to both, so there is no ordering requirement
// between them and no race in which one cancels what the other is capturing.
//
// ── 🔴 WHAT IT WILL NOT DO ────────────────────────────────────────────────────────────────────────
// It cannot cancel anything. There is no cancellation code in this route or in the module it calls, and
// the rows it is given have already excluded every 'pending' order by an allow-list on status. A card
// order waiting for an operator to press Confirm is holding its customer's money CORRECTLY, for as long
// as the operator takes, and this job never sees it.
//
// ── SCHEDULE ──────────────────────────────────────────────────────────────────────────────────────
// Registered in vercel.json at */15. The grace window is 10 minutes, so a capture that fails at
// confirmation is retried within about 25 minutes at worst, against a Stripe hold that lives ~7 days.
// ⚠️ THE RECORDED FAILURE MODE APPLIES HERE TOO: "when the Vault service_role_key was deleted, every
// scheduled invocation 401'd and nothing surfaced it." A job that never runs cannot report that it never
// ran. The mitigation is the same one the cancellation sweep relies on — the work is idempotent and the
// backlog is a single SQL predicate, so a resumed job catches up rather than losing anything:
//     select * from find_stranded_authorisations(10, 500);
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { recoverStrandedAuthorisations } from '@/lib/payments/stranded-authorisations'

export const runtime = 'nodejs'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand — the
 *  same gate app/api/cron/cancel-stale-authorizations uses. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // ⚠️ `?dry=1` LISTS WITHOUT CAPTURING. For a human who wants to see what the schedule would do before
  // letting it do it. Cron never sends it.
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'

  const res = await recoverStrandedAuthorisations(supabase, { limit: 100, dryRun })

  if (!res.ok) {
    // 🔴 A 500, NOT AN `ok: true, examined: 0`. The query itself failed, so this run knows NOTHING about
    // whether money is stranded. Reporting zero here would turn a broken backstop into a clean bill of
    // health, and Vercel's cron dashboard would show a green tick over an unanswered question.
    console.error('[cron/capture-stranded] 🔴 THE BACKSTOP COULD NOT RUN — stranded money, if any, is undetected:', res.error)
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
  }

  // ⚠️ `stillStranded > 0` IS THE FIELD THAT MATTERS. It means a confirmed order is holding money that
  // this job tried and failed to take — the audit log's `capture_failed` row says why.
  return NextResponse.json({ ok: true, dryRun, ...res.summary })
}
