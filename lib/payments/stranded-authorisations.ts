// lib/payments/stranded-authorisations.ts
// 🔴 THE BACKSTOP FOR MONEY THAT SHOULD HAVE MOVED AND DID NOT.
//
// ── THE STATE THIS EXISTS FOR ───────────────────────────────────────────────────────────────────
// An order the truck has ACCEPTED, whose customer's card is still merely held. The food is promised,
// the money is not taken, and the hold will silently drop off the customer's card in about seven days
// when Stripe expires it. The truck will never know it was not paid.
//
// ── 🔴 WHY IT HAD TO BE BUILT: THREE SAFETY NETS, NONE OF THEM COVERING THIS ────────────────────
// Order 19, 12 August 2026. Confirmed at 20:40:36 with £6.50 authorised. Capture never ran. Nothing
// found it — a human found it, in the Stripe dashboard, two days later.
//   • the CANCELLATION sweep (app/api/cron/cancel-stale-authorizations) filters `promoted_at is null`.
//     This draft was promoted, so it was invisible to the one job whose purpose is unresolved money.
//   • `purge_order_drafts()` also skips promoted rows, deliberately (20260814) — they are what the
//     CARD HELD display reads. Correct, and it means the row sits there unexamined forever.
//   • `action_audit_log` had nothing, because capture was never ATTEMPTED. `capture_failed` only exists
//     when something tried. AN UNATTEMPTED ACTION LEAVES NO TRACE ANYWHERE, which is why "check the
//     audit log" was not, and could not have been, the answer.
//
// ── 🔴 IT CAPTURES. IT NEVER CANCELS. ───────────────────────────────────────────────────────────
// The correct resolution for a confirmed order holding money is to TAKE it — the truck accepted the
// order and is owed. Cancelling would be deciding, on a schedule, that a customer with food coming does
// not have to pay. So the only verb in this file is capture, and there is no code path that releases a
// hold. That is half the answer to "why can this not touch an order awaiting confirmation".
// The other half is the predicate: `find_stranded_authorisations` requires an ACCEPTED order status
// (an allow-list, 'pending' absent), so a hold waiting on a human is never even returned. Either half
// alone would be sufficient; both are present because this runs unattended against real money.
//
// ── ⚠️ RETRYING IS SAFE, BY CONSTRUCTION, NOT BY LUCK ──────────────────────────────────────────
// captureOnConfirmation is idempotent at three layers (ledger pre-check, Stripe's own refusal, the
// unique index on idempotency_key). Running this every fifteen minutes against a row that is already
// captured costs one indexed read and does nothing.
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureOnConfirmation } from '@/lib/payments/capture'
import { markAuthorizationCancelled } from '@/lib/payments/order-drafts'
import { logAction } from '@/lib/audit/actionAudit'

/** One confirmed order whose authorisation was never captured and never released. */
export interface StrandedAuthorisation {
  orderKey: string
  truckId: string
  /** The display number the operator sees on the board. */
  orderId: string
  orderStatus: string
  paymentIntentId: string
  totalMinor: number
  promotedAt: string
}

/**
 * 🔴 MINUTES BEFORE A HELD, CONFIRMED ORDER COUNTS AS STRANDED.
 *
 * Capture runs inline, in the same request that writes 'confirmed', and takes about a second. Ten
 * minutes is therefore not a tolerance for slowness — it is the margin that makes a hit here mean
 * "the capture never happened" rather than "the capture is happening right now". It also covers the
 * webhook and the redirect racing to promote the same draft.
 * ⚠️ RAISING IT DELAYS DETECTION. LOWERING IT TOWARDS ZERO produces false positives that this file
 * would then act on, and acting on a false positive means capturing an order twice — which cannot
 * happen (see the idempotency note in the header), but would still fill the audit log with noise that
 * trains everyone to ignore it.
 */
export const STRANDED_GRACE_MINUTES = 10

/**
 * Everything currently stranded, oldest first.
 *
 * 🔴 RETURNS AN ERROR RESULT, NEVER AN EMPTY LIST, WHEN IT CANNOT ASK. A backstop that answers
 * "nothing is wrong" because its own query failed is worse than no backstop at all — it converts an
 * outage into a clean bill of health. The caller must surface `ok: false` and must not treat it as zero.
 * ⚠️ REQUIRES 20260815_find_stranded_authorisations.sql. Until that is applied this returns
 * `ok: false` with PostgREST's PGRST202 ("function not found"), which is exactly the loud failure
 * intended — see the deploy-coupling note in the migration.
 */
export async function listStrandedAuthorisations(
  supabase: SupabaseClient,
  opts: { graceMinutes?: number; limit?: number } = {},
): Promise<{ ok: true; rows: StrandedAuthorisation[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('find_stranded_authorisations', {
    p_grace_minutes: opts.graceMinutes ?? STRANDED_GRACE_MINUTES,
    p_limit:         opts.limit ?? 100,
  })
  if (error) {
    console.error('[stranded] 🔴 COULD NOT ASK WHETHER ANY ORDER IS STRANDED:', error.message)
    return { ok: false, error: error.message }
  }
  const rows = (data ?? []) as {
    order_key: string; truck_id: string; order_id: string; order_status: string
    payment_intent_id: string; total_minor: number; promoted_at: string
  }[]
  return {
    ok: true,
    rows: rows.map(r => ({
      orderKey:         r.order_key,
      truckId:          r.truck_id,
      orderId:          r.order_id,
      orderStatus:      r.order_status,
      paymentIntentId:  r.payment_intent_id,
      totalMinor:       r.total_minor,
      promotedAt:       r.promoted_at,
    })),
  }
}

export interface RecoveryOutcome {
  orderKey: string
  orderId: string
  truckId: string
  paymentIntentId: string
  totalMinor: number
  /** What captureOnConfirmation said. `captured` and `already` are resolutions; the rest are not. */
  result: string
  detail?: string
}

export interface RecoverySummary {
  /** How many stranded rows the query returned. */
  examined: number
  /** How many are now paid because of this run. */
  recovered: number
  /** 🔴 STILL HOLDING MONEY AFTER THIS RUN. Non-zero means a human is needed. */
  stillStranded: number
  outcomes: RecoveryOutcome[]
}

/**
 * Find every stranded authorisation and take the money the truck is owed.
 *
 * ── 🔴 IT RECORDS THAT THE GAP EXISTED, EVEN WHEN IT CLOSES IT ─────────────────────────────────
 * A silent self-heal is how a defect survives for months. Every stranded order gets a `capture_missing`
 * audit row the FIRST time it is seen, before any repair is attempted — so "capture is failing
 * somewhere" is answerable from the log even if every single one was recovered a second later.
 * ⚠️ ONCE PER ORDER, not once per run. One indexed read of action_audit_log (order_key is indexed)
 * decides. Without that, an order whose capture keeps failing would write a row every fifteen minutes
 * forever, and a log nobody can read is a log nobody reads.
 *
 * @param dryRun list and log, capture nothing. For a human checking what it WOULD do.
 */
export async function recoverStrandedAuthorisations(
  supabase: SupabaseClient,
  opts: { graceMinutes?: number; limit?: number; dryRun?: boolean } = {},
): Promise<{ ok: true; summary: RecoverySummary } | { ok: false; error: string }> {
  const found = await listStrandedAuthorisations(supabase, opts)
  if (!found.ok) return found

  const outcomes: RecoveryOutcome[] = []
  let recovered = 0

  for (const row of found.rows) {
    // 🔴 LOUD, EVERY RUN, WHETHER OR NOT THE REPAIR WORKS. The audit row is deduplicated; this line is
    // not, because the number of these in a day is the signal.
    console.error(
      `[stranded] 🔴 CONFIRMED ORDER HOLDING UNCAPTURED MONEY: order #${row.orderId} ` +
      `(order_key=${row.orderKey}, truck=${row.truckId}, status=${row.orderStatus}) has ` +
      `${row.totalMinor}p held on pi=${row.paymentIntentId} since ${row.promotedAt} and no ledger row.`,
    )
    await recordFirstSighting(supabase, row)

    if (opts.dryRun) {
      outcomes.push({ ...toOutcome(row), result: 'dry_run' })
      continue
    }

    // ⚠️ THE SAME FUNCTION EVERY CONFIRMATION SITE CALLS, with a trigger that says this was a repair.
    // It cannot throw, and it writes `capture_failed` itself when it fails.
    const cap = await captureOnConfirmation(supabase, {
      orderKey: row.orderKey, truckId: row.truckId, trigger: 'stranded_sweep',
    })

    if (cap.status === 'captured' || cap.status === 'already') {
      recovered++
      // 🔴 A RECOVERY IS A DEFECT REPORT, NOT A SUCCESS STORY. It means the confirmation site that
      // should have captured did not, and this row is how that is counted later.
      await logAction(supabase, {
        action:     'capture_recovered',
        truckId:    row.truckId,
        orderKey:   row.orderKey,
        amountMinor: cap.status === 'captured' ? cap.amountMinor : row.totalMinor,
        beforeState: { payment_intent_id: row.paymentIntentId, promoted_at: row.promotedAt, captured: false },
        afterState:  { captured: true, via: 'stranded_sweep', result: cap.status, order_status: row.orderStatus },
        actor:      { actorKind: 'unknown', actorId: null, actorLabel: null },
        source:     'web',
      })
      console.log(
        `[stranded] recovered order #${row.orderId} order_key=${row.orderKey} pi=${row.paymentIntentId} ` +
        `(${cap.status}) — the money is now taken and the board will read paid.`,
      )
    } else if (cap.status === 'not_owed') {
      // 🔴 THE GUARD FIRED. This is the 12 August case, caught. captureOnConfirmation has already
      // logged it loudly and written a `capture_not_owed` audit row; nothing more is done here on
      // purpose — in particular the hold is NOT released, because deciding between "capture the
      // remainder" and "give the hold back" is a human's call and releasing money is irreversible.
      // ⚠️ IT KEEPS BEING RETURNED BY THE SQL FUNCTION UNTIL SOMEBODY RESOLVES IT, which is correct:
      // an order with a live hold and money already taken is an open problem, not a closed one. The
      // audit row is deduplicated by nothing, but `capture_not_owed` is rare by construction.
      console.error(
        `[stranded] 🔴 REFUSED to capture order #${row.orderId} order_key=${row.orderKey}: ${cap.reason} ` +
        `(paid=${cap.paidMinor}p, owed=${cap.balanceMinor}p, hold=${cap.authorisedMinor}p). The hold is ` +
        `still live and needs resolving by hand.`,
      )
    } else if (cap.status === 'expired') {
      // ── 🔴 THE HOLD IS GONE AND NO RETRY WILL EVER BRING IT BACK. WRITE THAT DOWN. ─────────────
      // Stripe expires an uncaptured intent after ~7 days, and this row is by definition older than the
      // grace window. Left unmarked, it would be returned by every run from now until the heat death of
      // the truck: a Stripe call and a `capture_failed` row every fifteen minutes, for an order nothing
      // can fix. A log that grows without bound is a log nobody reads.
      // 🔴 AND THE MARK IS THE TRUTH, NOT A SILENCER. `authorization_cancelled_at` means "this
      // authorisation is no longer holding the customer's money", which is exactly what Stripe just
      // said. Setting it makes the CARD HELD chip disappear and the order read as owing money at the
      // hatch — WHICH IS CORRECT. No money moved, the hold is released, and the operator must collect.
      // ⚠️ ONLY ON `expired`. A `failed` is transient (a network blip, a Stripe outage, a missing
      // connected account) and MUST keep being retried — marking that cancelled would abandon a live
      // hold and lose the truck its money silently, which is the whole failure this file exists for.
      await markAuthorizationCancelled(supabase, row.orderKey)
      console.error(
        `[stranded] 🔴 UNRECOVERABLE order #${row.orderId} order_key=${row.orderKey} ` +
        `pi=${row.paymentIntentId}: ${cap.detail}. The hold is gone, no money was taken, and the order ` +
        `IS accepted — THE CUSTOMER OWES ${row.totalMinor}p AT THE HATCH. Marked cancelled so this ` +
        `stops being retried; a capture_failed row records why.`,
      )
    }
    outcomes.push({ ...toOutcome(row), result: cap.status, detail: 'detail' in cap ? cap.detail : undefined })
  }

  const summary: RecoverySummary = {
    examined:      found.rows.length,
    recovered,
    stillStranded: found.rows.length - recovered,
    outcomes,
  }
  console.log(
    `[stranded] examined=${summary.examined} recovered=${summary.recovered} ` +
    `still_stranded=${summary.stillStranded}${opts.dryRun ? ' (DRY RUN, nothing captured)' : ''}`,
  )
  return { ok: true, summary }
}

function toOutcome(row: StrandedAuthorisation): Omit<RecoveryOutcome, 'result'> {
  return {
    orderKey: row.orderKey, orderId: row.orderId, truckId: row.truckId,
    paymentIntentId: row.paymentIntentId, totalMinor: row.totalMinor,
  }
}

/**
 * Write `capture_missing` once per order, ever.
 *
 * ⚠️ THE READ IS THE DEDUPLICATION AND IT IS NOT A RACE WORTH CLOSING. Two concurrent runs of the same
 * cron could both miss and both write; the cost is a duplicate row in an append-only log, which the
 * log's own design tolerates (it never updates and never deletes). A unique index would be the
 * alternative and it would mean a migration on the audit table, which is a much larger promise than
 * this needs.
 * ⚠️ A FAILED READ FAILS OPEN — it writes. A duplicate row is cheaper than a missing one.
 */
async function recordFirstSighting(supabase: SupabaseClient, row: StrandedAuthorisation): Promise<void> {
  const { data } = await supabase
    .from('action_audit_log')
    .select('id')
    .eq('order_key', row.orderKey)
    .eq('action', 'capture_missing')
    .limit(1)
    .maybeSingle()
  if (data) return

  await logAction(supabase, {
    action:      'capture_missing',
    truckId:     row.truckId,
    orderKey:    row.orderKey,
    amountMinor: row.totalMinor,
    beforeState: {
      payment_intent_id: row.paymentIntentId,
      promoted_at:       row.promotedAt,
      order_status:      row.orderStatus,
      order_id:          row.orderId,
    },
    afterState: {
      // 🔴 THE SENTENCE A HUMAN READING THIS LOG IN SIX WEEKS NEEDS. The row is the evidence; this is
      // what it means.
      found_by: 'stranded_sweep',
      meaning:  'the truck accepted this order and its card authorisation was never captured',
    },
    actor:  { actorKind: 'unknown', actorId: null, actorLabel: null },
    source: 'web',
  })
}
