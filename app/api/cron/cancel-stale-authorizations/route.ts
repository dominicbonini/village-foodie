// app/api/cron/cancel-stale-authorizations/route.ts
// ── 🔴 THE SWEEP THAT GIVES MONEY BACK. IT IS NOT OPTIONAL AND IT IS NOT purge_order_drafts(). ──────
// Every authorisation this system takes must end as either a captured order or a released hold. Most do
// so within seconds. This job exists for the ones that do not:
//
//   • the customer authorised and then closed the tab, AND the webhook's out-of-band promotion was
//     dropped by a frozen serverless invocation
//   • promotion refused (stock ran out while they paid) and the immediate cancel itself failed
//   • the draft expired with an intent attached and nothing ever promoted it
//
// 🔴 `purge_order_drafts()` DOES NOT COVER THIS AND MUST NOT BE MISTAKEN FOR IT. That function DELETES
// ROWS. It moves no money, calls no payment provider, and — since
// 20260813_order_drafts_authorization.sql — explicitly REFUSES to delete a draft whose authorisation has
// not been cancelled, precisely so that deleting the row can never be what "resolves" a live hold. The
// two jobs are in sequence, not in competition: THIS one releases the money and marks the draft; the
// purge then erases the row and its PII on a later pass.
// ⚠️ SO ERASURE NOW DEPENDS ON THIS JOB TOO. If it stops running, drafts holding money accumulate and
// their customer details outlive their expiry. That is the correct trade — lingering details are
// recoverable, orphaned money is not — but it means this is load-bearing for two reasons, not one.
//
// ── SCHEDULE ────────────────────────────────────────────────────────────────────────────────────────
// 🔴 A SCHEDULED SWEEP IS REQUIRED. Nothing else in the system will ever look at an abandoned
// authorisation: the customer is gone, the webhook already fired or never will, and no operator sees a
// draft. NOT YET REGISTERED IN vercel.json — the cron entry has to be added deliberately, alongside the
// existing jobs, and that is a deploy decision rather than a code one.
//   Suggested: every 10 minutes. Drafts expire at 30, and Stripe holds an uncaptured intent for ~7 days,
//   so the window is generous — but a customer watching a pending authorisation on their banking app is
//   not thinking about Stripe's timeouts.
//
// ⚠️ THE RECORDED FAILURE MODE APPLIES: "when the Vault service_role_key was deleted, every scheduled
// invocation 401'd and nothing surfaced it." A job that never runs cannot report that it never ran. The
// mitigation here is that the work is IDEMPOTENT and the backlog is queryable — one SQL predicate names
// every outstanding hold — so a resumed job catches up rather than losing anything.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { listUncancelledAuthorizations, markAuthorizationCancelled } from '@/lib/payments/order-drafts'
import { cancelAuthorization, stripeAccountForTruck } from '@/lib/payments/authorize'

export const runtime = 'nodejs'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand — the
 *  same gate app/api/cron/account-deletion-due uses. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // "Has money against it, has not been promoted, has not been cancelled, and its window has passed."
  // Bounded, so one bad day cannot make the job run past its timeout and cancel nothing at all.
  const stale = await listUncancelledAuthorizations(supabase, 100)
  if (!stale.length) return NextResponse.json({ ok: true, examined: 0, cancelled: 0 })

  let cancelled = 0
  const failures: { orderKey: string; detail: string }[] = []

  for (const draft of stale) {
    if (!draft.payment_intent_id) continue
    const account = await stripeAccountForTruck(supabase, draft.truck_id)
    if (!account) {
      // 🔴 MONEY WE CANNOT REACH. The truck's Stripe account is gone or was never linked, so there is no
      // account context to cancel the intent on. Loud, named, and left alone — guessing an account would
      // be worse than reporting it.
      console.error(
        `[cron/cancel-stale] 🔴 NO STRIPE ACCOUNT for truck=${draft.truck_id} — cannot cancel ` +
        `pi=${draft.payment_intent_id} (draft=${draft.order_key}, ${draft.total_minor}p held). Reconcile by hand.`,
      )
      failures.push({ orderKey: draft.order_key, detail: 'no stripe account' })
      continue
    }

    const res = await cancelAuthorization({ paymentIntentId: draft.payment_intent_id, stripeAccountId: account })
    if (res.ok) {
      // 🔴 CANCEL FIRST, MARK SECOND. Marking a hold released that is not released would hide it from
      // this very query, forever. The reverse — cancelled but unmarked — costs one wasted retry.
      await markAuthorizationCancelled(supabase, draft.order_key)
      cancelled++
      console.log(
        `[cron/cancel-stale] released pi=${draft.payment_intent_id} draft=${draft.order_key} ` +
        `truck=${draft.truck_id} amount_minor=${draft.total_minor}` +
        `${draft.promotion_failed_at ? ' (promotion had failed)' : ' (never promoted)'}` +
        `${res.detail ? ` [${res.detail}]` : ''}`,
      )
    } else {
      // ⚠️ LEFT UNMARKED ON PURPOSE, so the next run picks it up again. A capture-then-cancel race or a
      // Stripe outage both resolve on a retry; an intent that was CAPTURED will keep failing here, which
      // is exactly the signal a human needs.
      console.error(`[cron/cancel-stale] 🔴 cancel failed pi=${draft.payment_intent_id} draft=${draft.order_key}: ${res.detail}`)
      failures.push({ orderKey: draft.order_key, detail: res.detail ?? 'unknown' })
    }
  }

  console.log(`[cron/cancel-stale] examined=${stale.length} cancelled=${cancelled} failed=${failures.length}`)
  return NextResponse.json({ ok: true, examined: stale.length, cancelled, failures })
}
